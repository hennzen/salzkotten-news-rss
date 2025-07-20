// generate-rss.js (based on DOM-samples/li.listEntry.html HTML structure with sequential crawler for all pages)
const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const RSS = require("rss");

const SITE_URL = "https://www.salzkotten.de";
const BASE_NEWS_URL = `${SITE_URL}/de/aktuelles/news-und-presse.php`;

/**
 * A reusable function to scrape news items from a given HTML content.
 * @param {string} html - The HTML content of a news page.
 * @returns {Array<object>} - An array of scraped article objects.
 */
function scrapeItemsFromHtml(html) {
  const $ = cheerio.load(html);
  const articles = [];

  $("li.listEntry.clickable").each((i, element) => {
    const item = $(element);
    const relativeUrl = item.attr("data-url");

    if (!relativeUrl) return;

    const url = `${SITE_URL}${relativeUrl}`;
    const title = item.find(".listEntryTitle a").text().trim();
    const description = item.find(".listEntryDescription").text().trim();
    const dateString = item.find(".listEntryDate").text().trim();

    const [day, month, year] = dateString.split(".");
    const date = new Date(`${year}-${month}-${day}`);

    if (title && url && date) {
      articles.push({ title, description, url, date });
    }
  });

  return articles;
}

async function generateRssFeed() {
  console.log("Starting RSS feed generation...");

  const feed = new RSS({
    title: "Stadt Salzkotten - News und Presse (All Pages)",
    description:
      "Aktuelle Nachrichten und Pressemitteilungen der Stadt Salzkotten",
    feed_url: `${SITE_URL}/feed.xml`,
    site_url: SITE_URL,
    language: "de",
    pubDate: new Date(),
  });

  try {
    let allArticles = [];
    let currentPageUrl = BASE_NEWS_URL;
    let pageCount = 1;

    // Use a while loop to crawl through pages as long as a "next" link is found
    while (currentPageUrl) {
      console.log(`Fetching page ${pageCount}: ${currentPageUrl}`);
      const response = await axios.get(currentPageUrl);
      const html = response.data;

      // Scrape items from the current page and add them to our master list
      const pageArticles = scrapeItemsFromHtml(html);
      allArticles = allArticles.concat(pageArticles);

      // Look for the link to the next page
      const $ = cheerio.load(html);
      const nextLink = $("a.pageNaviNextLink");

      if (nextLink.length > 0) {
        const nextHref = nextLink.attr("href");
        // The href is relative, so we resolve it against the base news URL
        currentPageUrl = new URL(nextHref, BASE_NEWS_URL).href;
        pageCount++;
      } else {
        // No "next" link found, we've reached the last page
        console.log("No more pages found. Concluding crawl.");
        currentPageUrl = null;
      }
    }

    console.log(`Finished fetching. Found ${allArticles.length} articles across ${pageCount} pages.`);

    // Sort all collected articles by date, newest first
    allArticles.sort((a, b) => b.date - a.date);

    // Add all sorted articles to the feed
    allArticles.forEach((article) => {
      feed.item({
        title: article.title,
        description: article.description,
        url: article.url,
        date: article.date,
      });
    });

    const xml = feed.xml({ indent: true });
    fs.writeFileSync("feed.xml", xml);

    console.log(
      `✅ RSS feed generated successfully with ${allArticles.length} items: feed.xml`
    );
  } catch (error) {
    console.error("❌ Error generating RSS feed:", error);
  }
}

generateRssFeed();