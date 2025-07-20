// generate-rss.js (based on DOM-samples/li.listEntry.html HTML structure)
const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const RSS = require("rss");

const SITE_URL = "https://www.salzkotten.de";
const NEWS_URL = `${SITE_URL}/de/aktuelles/news-und-presse.php`;

async function generateRssFeed() {
  console.log("Generating RSS feed...");

  const feed = new RSS({
    title: "Stadt Salzkotten - News und Presse",
    description: "Aktuelle Nachrichten und Pressemitteilungen der Stadt Salzkotten",
    feed_url: `${SITE_URL}/feed.xml`,
    site_url: SITE_URL,
    language: "de",
    pubDate: new Date(),
  });

  try {
    const response = await axios.get(NEWS_URL);
    const html = response.data;
    const $ = cheerio.load(html);

    // Iterate over each list item, which is an <li> with the class 'listEntry'
    $("li.listEntry.clickable").each((i, element) => {
      const item = $(element);

      // The relative URL is in the 'data-url' attribute of the <li>
      const relativeUrl = item.attr("data-url");
      if (!relativeUrl) return; // Skip if the URL is missing

      const url = `${SITE_URL}${relativeUrl}`;

      // Find the child elements within the list item
      const title = item.find(".listEntryTitle a").text().trim();
      const description = item.find(".listEntryDescription").text().trim();
      const dateString = item.find(".listEntryDate").text().trim();

      const [day, month, year] = dateString.split(".");
      const date = new Date(`${year}-${month}-${day}`);

      if (title && url && date) {
        feed.item({
          title: title,
          description: description,
          url: url,
          date: date,
        });
      }
    });

    const xml = feed.xml({ indent: true });
    fs.writeFileSync("feed.xml", xml);

    console.log("✅ RSS feed generated successfully: feed.xml");
  } catch (error) {
    console.error("❌ Error generating RSS feed:", error);
  }
}

generateRssFeed();