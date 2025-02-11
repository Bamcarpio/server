import express from "express";
import { google } from "googleapis";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs";

const credentials = JSON.parse(fs.readFileSync("/etc/secrets/serviceAccount.json", "utf8"));

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Function to convert Google Drive file links to direct image URLs
const convertDriveLink = (url) => {
  if (!url) return ""; 
  const match = url.match(/\/d\/(.*?)\/view/);
  return match ? `https://lh3.googleusercontent.com/d/${match[1]}=w500` : url;
};


// Fetch data from Google Sheets with dynamic sheet name and range
app.get("/data", async (req, res) => {
  try {
    const { sheet, range } = req.query;

    if (!sheet || !range) {
      return res.status(400).json({ error: "Sheet name and range are required" });
    }

    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheet}!${range}`, // Ensure correct format
    });

    let data = response.data.values || [];

    // Convert column J (index 9) from Google Drive URLs to direct image URLs
    data = data.map(row => {
      if (row[9]) row[9] = convertDriveLink(row[9]);
      return row;
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new product to Google Sheets
app.post("/add", async (req, res) => {
  try {
    const {
      sheet,
      sku,
      size,
      code,
      productName,
      smer,
      smerUpdatedPrice,
      kgaPrice,
      pictureUrl, // Handle picture URL
      shopLink,
      lazadaLink,
      tiktokLink,
    } = req.body;

    if (!sheet || !sku || !size || !code || !productName) {
      return res.status(400).json({ error: "All product fields are required" });
    }

    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheet}!A:M`, // Fixed template literal
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            sku, size, code, productName, smer, smerUpdatedPrice, "", size, kgaPrice, 
            pictureUrl || "", shopLink, lazadaLink, tiktokLink
          ]
        ],
      },
    });

    res.json({ message: "Added successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a product row by SKU
app.post("/delete", async (req, res) => {
  try {
    const { sheet, sku } = req.body;
    if (!sheet || !sku) {
      return res.status(400).json({ error: "Sheet and SKU are required" });
    }

    const sheets = await getSheetsClient();
    const sheetMetadata = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    const sheetInfo = sheetMetadata.data.sheets.find(s => s.properties.title === sheet);
    if (!sheetInfo) return res.status(404).json({ error: "Sheet not found" });

    const sheetId = sheetInfo.properties.sheetId;

    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheet}!A:M`,
    });

    const rows = readResponse.data.values;
    if (!rows || rows.length === 0) return res.status(404).json({ error: "No data found" });

    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === sku) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) return res.status(404).json({ error: "SKU not found" });

    const actualRowNumber = rowIndex + 1;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: "ROWS",
                startIndex: actualRowNumber - 1,
                endIndex: actualRowNumber,
              },
            },
          },
        ],
      },
    });

    res.json({ message: `Deleted row ${actualRowNumber} successfully!` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Edit an existing row
app.post("/edit", async (req, res) => {
  try {
    const { sheet, id, text } = req.body;
    if (!sheet || !id || !text) return res.status(400).json({ error: "Sheet, ID, and Text are required" });

    const sheets = await getSheetsClient();
    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheet}!A:B`, 
    });

    const rows = readResponse.data.values;
    if (!rows) return res.status(404).json({ error: "No data found" });

    let rowIndex = rows.findIndex(row => row[0] === id.toString());
    if (rowIndex === -1) return res.status(404).json({ error: "ID not found" });

    rowIndex += 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheet}!B${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: { values: [[text]] },
    });

    res.json({ message: "Edited successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
