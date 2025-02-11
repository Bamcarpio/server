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
      range: `${sheet}!${range}`, // Use dynamic sheet name and range
    });

    res.json(response.data.values || []); // Return the data as an array
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
      range: `${sheet}!A:M`, // Columns A to M
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            sku,               // Column A: SKU
            size,              // Column B: Size (First Size)
            code,              // Column C: Code
            productName,       // Column D: Product Name
            smer,              // Column E: SMER
            smerUpdatedPrice,  // Column F: SMER Updated Price
            "",                // Column G: Empty space
            size,              // Column H: Size (Second Size)
            kgaPrice,          // Column I: KGA Price
            pictureUrl || "",  // Column J: Picture URL (Placeholder for now)
            shopLink,          // Column K: Shop Link
            lazadaLink,        // Column L: Lazada Link
            tiktokLink         // Column M: TikTok Link
          ]
        ],
      },
    });

    res.json({ message: "Added successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post("/delete", async (req, res) => {
  try {
    const { sheet, sku } = req.body;
    if (!sheet || !sku) {
      return res.status(400).json({ error: "Sheet and SKU are required" });
    }

    const sheets = await getSheetsClient();

    // Get the sheet ID dynamically
    const sheetMetadata = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    const sheetInfo = sheetMetadata.data.sheets.find(s => s.properties.title === sheet);
    if (!sheetInfo) return res.status(404).json({ error: "Sheet not found" });

    const sheetId = sheetInfo.properties.sheetId;

    // Fetch all rows to find the exact SKU match
    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheet}!A:M`, // Make sure this includes all your rows
    });

    const rows = readResponse.data.values;
    if (!rows || rows.length === 0) return res.status(404).json({ error: "No data found" });

    // Find the row index based on SKU (ensure we find exact match)
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === sku) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) return res.status(404).json({ error: "SKU not found" });

    // Convert to actual row number in Google Sheets (since first row is 1-based)
    const actualRowNumber = rowIndex + 1; // No more shifting issue

    // Delete the exact row found
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId, // Correctly retrieved sheet ID
                dimension: "ROWS",
                startIndex: actualRowNumber - 1, // Zero-based index
                endIndex: actualRowNumber, // Ensure correct row is deleted
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



// Edit existing row
app.post("/edit", async (req, res) => {
  try {
    const { sheet, id, text } = req.body;
    if (!sheet || !id || !text) return res.status(400).json({ error: "Sheet, ID, and Text are required" });

    const sheets = await getSheetsClient();
    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheet}!A:B`, // Change the range to suit your sheet
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
