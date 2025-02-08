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
const SHEET_NAME = "Sheet1";

// Fetch all data from Google Sheets
app.get("/data", async (req, res) => {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:B`,
    });
    res.json(response.data.values || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new row
app.post("/add", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:B`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [[Date.now(), text]] },
    });

    res.json({ message: "Added successfully!" });
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

    rowIndex += 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!B${rowIndex}`,
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
