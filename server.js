import express from "express";
import { google } from "googleapis";
import cors from "cors";
import bodyParser from "body-parser";
import credentials from "./serviceAccount.js"; // Your Google Service Account

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

const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID"; // Replace with your actual spreadsheet ID
const SHEET_NAME = "Sheet1"; // Name of the sheet

// Add new row
app.post("/add", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:B`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      resource: {
        values: [[Date.now(), text]], // Using timestamp as ID
      },
    });

    res.json({ message: "Added successfully", data: response.data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Edit existing row
app.post("/edit", async (req, res) => {
  try {
    const { id, text } = req.body;
    if (!id || !text) return res.status(400).json({ error: "ID and Text are required" });

    const sheets = await getSheetsClient();
    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:B`,
    });

    const rows = readResponse.data.values;
    if (!rows) return res.status(404).json({ error: "No data found" });

    let rowIndex = rows.findIndex(row => row[0] === id.toString());
    if (rowIndex === -1) return res.status(404).json({ error: "ID not found" });

    rowIndex += 1; // Adjusting for 1-based index in Google Sheets API

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!B${rowIndex}`,
      valueInputOption: "RAW",
      resource: { values: [[text]] },
    });

    res.json({ message: "Edited successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
