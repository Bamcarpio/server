import express from "express";
import { google } from "googleapis";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import multerGoogleDrive from "multer-google-drive";
import fs from "fs";

const credentials = JSON.parse(fs.readFileSync("/etc/secrets/serviceAccount.json", "utf8"));

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets"],
});

const drive = google.drive({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID; // Google Drive folder ID

// Multer setup for Google Drive
const upload = multer({
  storage: multerGoogleDrive({
    drive,
    folder: GOOGLE_DRIVE_FOLDER_ID,
    mimetype: "image/jpeg",
  }),
});

const convertDriveLink = (url) => {
  if (!url) return ""; 
  const match = url.match(/\/d\/(.*?)\/view/);
  return match ? `https://lh3.googleusercontent.com/d/${match[1]}=w500` : url;
};


// Fetch data from Google Sheets and convert image links
app.get("/data", async (req, res) => {
  try {
    const { sheet, range } = req.query;
    if (!sheet || !range) {
      return res.status(400).json({ error: "Sheet name and range are required" });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheet}!${range}`,
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

// Upload file and return the Google Drive link
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const fileId = req.file.id;
    const driveLink = `https://drive.google.com/uc?export=view&id=${fileId}`;

    res.json({ success: true, driveLink });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save image link to Google Sheets
app.post("/save-image-link", async (req, res) => {
  try {
    const { sheet, sku, pictureUrl } = req.body;

    if (!sheet || !sku || !pictureUrl) {
      return res.status(400).json({ error: "Sheet, SKU, and Picture URL are required" });
    }

    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheet}!A:M`,
    });

    const rows = readResponse.data.values;
    if (!rows) return res.status(404).json({ error: "No data found" });

    let rowIndex = rows.findIndex(row => row[0] === sku);
    if (rowIndex === -1) return res.status(404).json({ error: "SKU not found" });

    rowIndex += 1; // Convert to 1-based index

    // Update column J (index 9)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheet}!J${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: { values: [[pictureUrl]] },
    });

    res.json({ message: "Image link saved successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
