# BlogScraper – Analyze Any Blog Article

# Overview
BlogScraper is a desktop application built with Electron and Python (BeautifulSoup) that allows users to analyze any blog article by simply entering a URL.

It extracts useful insights such as:

Article title
Author (if available)
Headings and structure
Paragraph content
Metadata (SEO tags, etc.)

# Features

Scrape blog content from any public URL
Analyze structure (headings, paragraphs, metadata)
Fast processing using Python and BeautifulSoup
Simple and clean desktop interface (Electron)

# Tech Stack

Electron (Desktop App Framework)
Node.js (Backend bridge)
Python (Web scraping)
BeautifulSoup4 (HTML parsing)

# Installation

Clone the repository
git clone https://github.com/your-username/blogscraper.git

cd blogscraper
Install Node dependencies
npm install
Install Python dependencies
pip install beautifulsoup4 requests
Run the app
npm start
 
Important Setup (Python Fix)

If you encounter:
'python' is not recognized as an internal or external command

# Do the following:

Uninstall Microsoft Store Python
Go to Settings → Apps → Installed Apps
Remove Python (Microsoft Store) and Python Manager
Install Python from python.org
Download from https://www.python.org/downloads/

During installation, enable:
Add Python to PATH

Verify installation
Open Command Prompt:
python --version
If still not working
Turn OFF App Execution Aliases:
Settings → Apps → Advanced app settings → App execution aliases
Disable python.exe and python3.exe

# Usage

Launch the app
Enter a blog URL
Click Analyze
View extracted content and structure

# Project Structure

main.js – Electron main process
preload.js – Secure bridge (IPC)
renderer.js – Frontend logic
index.html – UI layout
styles.css – Styling
python/script.py – Scraper logic

# Future Improvements

Keyword extraction and SEO scoring
Readability analysis
Export results (JSON / CSV)
Multi-article comparison

# Author
Heart Shiana Ursua

# License
MIT License
