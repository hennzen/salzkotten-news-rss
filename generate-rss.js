// generate-rss.js (based on DOM-samples/li.listEntry.html HTML structure with sequential crawler for all pages with stable pubDate)
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
  const fullCrawl = process.argv[2] === "--full";

  console.log("Starting RSS feed generation...");

  try {
    let allArticles = [];

    if (fullCrawl) {
      // Full crawl logic, executed only with --full, scanning all pages
      console.log("Performing a full crawl of all pages.");
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
      console.log(
        `Finished fetching. Found ${allArticles.length} articles across ${pageCount} pages.`
      );
    } else {
      
      // Quick update logic, scanning only the first page
      console.log("Performing a quick update check of the first page.");
      // 1. Load existing articles from the feed file.
      if (fs.existsSync("feed.xml")) {
        const existingXml = fs.readFileSync("feed.xml", "utf-8");
        const $ = cheerio.load(existingXml, { xmlMode: true });
        $("item").each((i, el) => {
          const item = $(el);
          allArticles.push({
            title: item.find("title").text(),
            description: item.find("description").text(),
            url: item.find("link").text(),
            date: new Date(item.find("pubDate").text()),
          });
        });
      }
      const existingUrls = new Set(allArticles.map((a) => a.url));

      // 2. Scrape only the first page.
      const response = await axios.get(BASE_NEWS_URL);
      const latestArticles = scrapeItemsFromHtml(response.data);

      // 3. Filter for articles that are actually new.
      const newArticles = latestArticles.filter(
        (a) => !existingUrls.has(a.url)
      );

      if (newArticles.length === 0) {
        console.log("No new articles found. Feed is up to date.");
        return; // Exit cleanly without writing a file.
      }

      console.log(`Found ${newArticles.length} new articles. Updating feed.`);
      allArticles = newArticles.concat(allArticles);
    }

    // Sort all collected articles by date, newest first
    allArticles.sort((a, b) => b.date - a.date);

    // 1. Determine the feed's publication date. Use the date of the newest article,
    //    or the current time if no articles are found (edge case).
    const feedPubDate =
      allArticles.length > 0 ? allArticles[0].date : new Date();

    // 2. Create the RSS feed object *after* all articles are scraped and sorted.
    const feed = new RSS({
      title: "Stadt Salzkotten - News und Presse (All Pages)",
      description:
        "Aktuelle Nachrichten und Pressemitteilungen der Stadt Salzkotten",
      feed_url: `${SITE_URL}/feed.xml`,
      site_url: SITE_URL,
      language: "de",
      pubDate: feedPubDate, // Use the determined stable date
    });

    // 3. Add all sorted articles to the feed
    allArticles.forEach((article) => {
      feed.item({
        title: article.title,
        description: article.description,
        url: article.url,
        date: article.date,
      });
    });

    let xml = feed.xml({ indent: true });

    // Remove the lastBuildDate tag entirely to prevent unnecessary commits.
    xml = xml.replace(/^\s*<lastBuildDate>.*<\/lastBuildDate>\n/gm, "");

    fs.writeFileSync("feed.xml", xml);

    console.log(
      `✅ RSS feed generated successfully with ${allArticles.length} items: feed.xml`
    );
  } catch (error) {
    console.error("❌ Error generating RSS feed:", error);
  }
}

generateRssFeed();