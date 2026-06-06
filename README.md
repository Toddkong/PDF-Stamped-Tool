# PDF Stamped Tool

A simple, secure, and privacy-focused PDF stamping tool that runs entirely in your browser.

## Features

- **PDF Document Processing** - Upload, preview, and edit PDF files locally
- **Signature Management** - Upload, save, and manage your signature images
- **Precise Stamping** - Drag to position, resize, and place stamps on single or multiple pages
- **Local Export** - All operations are performed locally, ensuring document security
- **Multiple Formats** - Export as PNG, JPG, or PDF
- **IndexedDB Storage** - Signatures and stamped documents are stored locally

## Tech Stack

- HTML5 + CSS3 + Vanilla JavaScript
- PDF.js for PDF rendering
- IndexedDB for local data storage
- jsPDF for PDF generation

## Project Structure

```
PDF-Stamped-Tool/
├── pages/
│   ├── index.html              # Home page, PDF upload
│   ├── pdf-editor.html         # PDF editor, stamping functionality
│   └── signature-manager.html  # Signature management page
├── js/
│   ├── signature-service.js    # Signature service
│   ├── pdf-service.js          # PDF processing service
│   └── database-service.js     # IndexedDB service
└── styles/
    └── main.css                # Main stylesheet
```

## Usage

1. Open `pages/index.html` in a modern browser
2. Upload a PDF file from the home page
3. Go to "Signature Manager" to upload your signature images
4. Navigate to "PDF Editor" to stamp your PDF
5. Select a signature and click on the PDF to place it
6. Adjust position and size as needed
7. Choose export format (PNG/JPG/PDF) and save

## Security

- All processing happens locally in your browser
- No data is sent to any server
- Your documents remain private and secure

## Browser Support

- Chrome (recommended)
- Firefox
- Edge
- Safari

## License

MIT License
