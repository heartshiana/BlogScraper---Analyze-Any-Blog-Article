#!/usr/bin/env python3
import sys
import json

# ── Dependency check FIRST — always emit JSON on failure ──────────────────
def _check_deps():
    missing = []
    for pkg, imp in [('requests', 'requests'), ('beautifulsoup4', 'bs4')]:
        try:
            __import__(imp)
        except ImportError:
            missing.append(pkg)
    if missing:
        print(json.dumps({
            'error': 'missing_packages',
            'message': (
                f"Missing Python packages: {', '.join(missing)}.\n"
                "Open \u2699 Settings \u2192 Install missing packages."
            )
        }), flush=True)
        sys.exit(1)

_check_deps()

# ── Now safe to import ────────────────────────────────────────────────────
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import re


def clean_text(text):
    if not text:
        return ""
    return re.sub(r'\s+', ' ', text).strip()


def extract_author(soup, url):
    meta_selectors = [
        {'name': 'author'},
        {'property': 'article:author'},
        {'name': 'twitter:creator'},
        {'property': 'og:article:author'},
    ]
    for sel in meta_selectors:
        tag = soup.find('meta', attrs=sel)
        if tag and tag.get('content'):
            return clean_text(tag['content'])

    author_patterns = [
        {'class': re.compile(r'author', re.I)},
        {'rel': 'author'},
        {'itemprop': 'author'},
        {'class': re.compile(r'byline', re.I)},
    ]
    for pattern in author_patterns:
        tag = soup.find(attrs=pattern)
        if tag:
            text = clean_text(tag.get_text())
            if text and len(text) < 100:
                return text

    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string or '')
            if isinstance(data, dict):
                author = data.get('author')
                if isinstance(author, dict):
                    return clean_text(author.get('name', ''))
                elif isinstance(author, str):
                    return clean_text(author)
        except Exception:
            pass

    return ""


def extract_date(soup):
    meta_selectors = [
        {'property': 'article:published_time'},
        {'name': 'publish_date'},
        {'name': 'date'},
        {'property': 'og:updated_time'},
        {'name': 'DC.date'},
    ]
    for sel in meta_selectors:
        tag = soup.find('meta', attrs=sel)
        if tag and tag.get('content'):
            return clean_text(tag['content'][:20])

    time_tag = soup.find('time')
    if time_tag:
        dt = time_tag.get('datetime') or clean_text(time_tag.get_text())
        if dt:
            return dt[:20]

    date_patterns = [
        {'class': re.compile(r'date|time|publish', re.I)},
        {'itemprop': 'datePublished'},
        {'itemprop': 'dateModified'},
    ]
    for pattern in date_patterns:
        tag = soup.find(attrs=pattern)
        if tag:
            text = clean_text(tag.get_text())
            if text and len(text) < 50:
                return text

    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string or '')
            if isinstance(data, dict):
                date = data.get('datePublished') or data.get('dateModified')
                if date:
                    return clean_text(date)[:20]
        except Exception:
            pass

    return ""


def extract_title(soup):
    og = soup.find('meta', property='og:title')
    if og and og.get('content'):
        return clean_text(og['content'])

    tw = soup.find('meta', attrs={'name': 'twitter:title'})
    if tw and tw.get('content'):
        return clean_text(tw['content'])

    h1 = soup.find('h1')
    if h1:
        return clean_text(h1.get_text())

    title = soup.find('title')
    if title:
        return clean_text(title.get_text())

    return "Untitled"


def extract_content(soup):
    for tag in soup(['script', 'style', 'nav', 'footer', 'header',
                     'aside', 'form', 'button', 'noscript', 'iframe']):
        tag.decompose()

    article_containers = [
        soup.find('article'),
        soup.find('main'),
        soup.find(attrs={'class': re.compile(r'post-content|entry-content|article-body|blog-content|content-body', re.I)}),
        soup.find(attrs={'id': re.compile(r'post-content|entry-content|article-body|content', re.I)}),
        soup.find(attrs={'itemprop': 'articleBody'}),
    ]

    container = next((c for c in article_containers if c), None) or soup.body or soup

    paragraphs = []
    seen = set()

    for tag in container.find_all(['h1', 'h2', 'h3', 'h4', 'p', 'blockquote', 'li']):
        text = clean_text(tag.get_text())
        if not text or text in seen:
            continue
        if len(text) < 20:
            continue
        seen.add(text)
        entry = {
            'type': tag.name if tag.name in ['h1','h2','h3','h4','blockquote'] else 'p',
            'text': text
        }
        paragraphs.append(entry)

    if not paragraphs:
        for p in soup.find_all('p'):
            text = clean_text(p.get_text())
            if text and len(text) > 30 and text not in seen:
                seen.add(text)
                paragraphs.append({'type': 'p', 'text': text})

    return paragraphs[:60]


def extract_images(soup, base_url):
    images = []
    seen_srcs = set()

    for img in soup.find_all('img'):
        src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or ''
        if not src:
            continue
        src = urljoin(base_url, src)
        if src.startswith('data:'):
            continue
        if src in seen_srcs:
            continue
        width = img.get('width', '0')
        height = img.get('height', '0')
        try:
            if int(str(width)) < 50 or int(str(height)) < 50:
                continue
        except Exception:
            pass
        seen_srcs.add(src)
        images.append({
            'src': src,
            'alt': clean_text(img.get('alt', '')),
            'width': str(width),
            'height': str(height),
        })

    og_img = soup.find('meta', property='og:image')
    if og_img and og_img.get('content'):
        og_src = urljoin(base_url, og_img['content'])
        if og_src not in seen_srcs:
            images.insert(0, {'src': og_src, 'alt': 'Featured Image', 'width': '', 'height': ''})

    return images[:20]


def scrape(url):
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/120.0.0.0 Safari/537.36'
        ),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    }

    response = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, 'html.parser')

    description = ""
    og_desc = soup.find('meta', property='og:description') or soup.find('meta', attrs={'name': 'description'})
    if og_desc and og_desc.get('content'):
        description = clean_text(og_desc['content'])

    return {
        'title': extract_title(soup),
        'description': description,
        'content': extract_content(soup),
        'images': extract_images(soup, url),
        'author': extract_author(soup, url),
        'date': extract_date(soup),
        'url': url,
        'domain': urlparse(url).netloc,
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'no_url', 'message': 'No URL provided'}), flush=True)
        sys.exit(1)

    url = sys.argv[1]
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        print(json.dumps({'error': 'invalid_url', 'message': f'Invalid URL: {url}'}), flush=True)
        sys.exit(1)

    try:
        data = scrape(url)
        print(json.dumps(data, ensure_ascii=False), flush=True)
    except requests.exceptions.ConnectionError:
        print(json.dumps({'error': 'connection_error', 'message': 'Could not connect. Check your internet connection.'}), flush=True)
        sys.exit(1)
    except requests.exceptions.Timeout:
        print(json.dumps({'error': 'timeout', 'message': 'Request timed out. The website may be slow or unreachable.'}), flush=True)
        sys.exit(1)
    except requests.exceptions.HTTPError as e:
        print(json.dumps({'error': 'http_error', 'message': f'HTTP {e.response.status_code}: {e.response.reason}'}), flush=True)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({'error': 'scrape_error', 'message': str(e)}), flush=True)
        sys.exit(1)
