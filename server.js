const express = require('express');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

const app = express();
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// File paths
const QUOTATIONS_FILE = path.join(__dirname, 'data', 'quotations.json');
const SUBMITTED_QUOTES_FILE = path.join(__dirname, 'data', 'submitted_quotes.json');

// Create folders
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
if (!fs.existsSync(path.join(__dirname, 'quotations'))) fs.mkdirSync(path.join(__dirname, 'quotations'));

// Initialize files
if (!fs.existsSync(QUOTATIONS_FILE)) {
    fs.writeFileSync(QUOTATIONS_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(SUBMITTED_QUOTES_FILE)) {
    fs.writeFileSync(SUBMITTED_QUOTES_FILE, JSON.stringify([], null, 2));
}

function getQuotations() {
    const data = fs.readFileSync(QUOTATIONS_FILE, 'utf8');
    return JSON.parse(data);
}

function saveQuotation(quotation) {
    const quotations = getQuotations();
    quotations.push(quotation);
    fs.writeFileSync(QUOTATIONS_FILE, JSON.stringify(quotations, null, 2));
}

function updateQuotationStatus(id, status, submittedPrices, sellerNotes, taxRate, shippingCost) {
    const quotations = getQuotations();
    const index = quotations.findIndex(q => q.id === id);
    if (index !== -1) {
        quotations[index].status = status;
        quotations[index].submittedPrices = submittedPrices;
        quotations[index].sellerNotes = sellerNotes;
        quotations[index].taxRate = taxRate;
        quotations[index].shippingCost = shippingCost;
        quotations[index].submittedAt = new Date().toISOString();
        
        const subtotal = submittedPrices.reduce((sum, p) => sum + (p.price * p.quantity), 0);
        const tax = subtotal * (taxRate / 100);
        const grandTotal = subtotal + tax + (shippingCost || 0);
        quotations[index].subtotal = subtotal;
        quotations[index].grandTotal = grandTotal;
        
        fs.writeFileSync(QUOTATIONS_FILE, JSON.stringify(quotations, null, 2));
        
        const submitted = JSON.parse(fs.readFileSync(SUBMITTED_QUOTES_FILE, 'utf8'));
        submitted.push({
            quotationId: id,
            customerCompany: quotations[index].customerCompany,
            customerName: quotations[index].customerName,
            customerEmail: quotations[index].customerEmail,
            submittedPrices,
            sellerNotes,
            taxRate,
            shippingCost,
            subtotal,
            grandTotal,
            submittedAt: new Date().toISOString()
        });
        fs.writeFileSync(SUBMITTED_QUOTES_FILE, JSON.stringify(submitted, null, 2));
        return true;
    }
    return false;
}

// Generate PDF
async function generatePDF(quotation, filepath) {
    return new Promise(async (resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);
        
        doc.rect(0, 0, doc.page.width, doc.page.height).fill('#e8e8e8');
        doc.save();
        doc.opacity(0.7);
        doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff');
        doc.restore();
        
        doc.opacity(0.6);
        doc.circle(250, 100, 45).fill('#667eea');
        doc.fillColor('#ffffff')
           .fontSize(32)
           .font('Helvetica-Bold')
           .text('PLS', 230, 85);
        doc.opacity(1);
        
        doc.opacity(0.15);
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#333')
           .text('PRIMELINK SOURCING', 200, 165, { align: 'center' });
        
        doc.fontSize(9)
           .fillColor('#666')
           .text('Sourcing & Procurement Division', 200, 185, { align: 'center' })
           .text('Email: sourcing@primelink.com | Phone: +1 647 555 0123', 200, 200, { align: 'center' });
        
        doc.fontSize(18)
           .font('Helvetica-Bold')
           .fillColor('#667eea')
           .text('REQUEST FOR QUOTATION (RFQ)', 200, 240, { align: 'center' });
        
        doc.opacity(0.1);
        doc.rect(50, 280, 500, 180).fill('#aaaaaa');
        doc.fontSize(12)
           .fillColor('#000000')
           .text('CONFIDENTIAL', 250, 350, { align: 'center' });
        doc.fontSize(9)
           .text('Click the button below to view the complete quotation', 250, 380, { align: 'center' });
        doc.opacity(1);
        
        const buttonY = 490;
        const buttonWidth = 420;
        const buttonHeight = 70;
        const buttonX = (doc.page.width - buttonWidth) / 2;
        
        doc.opacity(0.3);
        doc.rect(buttonX + 3, buttonY + 3, buttonWidth, buttonHeight).fill('#000000');
        doc.opacity(1);
        doc.rect(buttonX, buttonY, buttonWidth, buttonHeight).fill('#28a745');
        doc.rect(buttonX, buttonY, buttonWidth, 5).fill('#3cb043');
        
        const baseUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
        const viewUrl = `${baseUrl}/view/${quotation.id}`;
        
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .fillColor('#ffffff')
           .text('🔓 CLICK HERE TO VIEW QUOTATION', buttonX + 35, buttonY + 22, {
               link: viewUrl,
               underline: false
           });
        
        doc.fontSize(12)
           .fillColor('#d4ffd4')
           .text('Click to access the complete, clear quotation', buttonX + 80, buttonY + 48, {
               link: viewUrl
           });
        
        const instY = buttonY + 100;
        doc.fontSize(9)
           .fillColor('#555')
           .text('📌 INSTRUCTIONS:', 50, instY)
           .text('1. Click the green button above', 50, instY + 18)
           .text('2. You will be directed to our secure online portal', 50, instY + 33)
           .text('3. View the complete, clear quotation with all details', 50, instY + 48)
           .text('4. Submit your prices online', 50, instY + 63);
        
        const pageHeight = doc.page.height;
        doc.fontSize(8)
           .fillColor('#999')
           .text(`Reference: PLS-${quotation.id.substring(0, 8).toUpperCase()}`, 50, pageHeight - 40, { align: 'center' })
           .text(`Issued: ${new Date(quotation.createdAt).toLocaleDateString()}`, 50, pageHeight - 25, { align: 'center' });
        
        doc.end();
        
        stream.on('finish', resolve);
        stream.on('error', reject);
    });
}

// API: Create RFQ
app.post('/api/create-quotation', async (req, res) => {
    try {
        const {
            customerCompany, customerName, customerEmail, customerPhone,
            items, notes, validDays
        } = req.body;
        
        const id = uuidv4();
        const createdAt = new Date().toISOString();
        const validUntil = new Date(Date.now() + (validDays || 30) * 24 * 60 * 60 * 1000).toISOString();
        
        const quotation = {
            id,
            customerCompany,
            customerName,
            customerEmail,
            customerPhone: customerPhone || '',
            items: items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                unit: item.unit || 'pcs'
            })),
            notes: notes || '',
            createdAt,
            validUntil,
            status: 'pending'
        };
        
        saveQuotation(quotation);
        
        const pdfPath = path.join(__dirname, 'quotations', `${id}.pdf`);
        await generatePDF(quotation, pdfPath);
        
        res.json({
            success: true,
            message: 'RFQ created!',
            quotationId: id,
            downloadLink: `/download/${id}`
        });
        
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
});

// ========== FIXED VIEW ROUTE ==========
app.get('/view/:id', (req, res) => {
    const id = req.params.id;
    console.log('🔍 Looking for quotation with ID:', id);
    
    const quotations = getQuotations();
    console.log('📊 Total quotations in database:', quotations.length);
    
    const quotation = quotations.find(q => q.id === id);
    
    if (!quotation) {
        console.log('❌ Quotation NOT found for ID:', id);
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>RFQ Not Found</title>
                <style>
                    body { font-family: Arial; text-align: center; padding: 50px; }
                    .error-box { background: #f8d7da; color: #721c24; padding: 20px; border-radius: 10px; max-width: 500px; margin: 0 auto; }
                </style>
            </head>
            <body>
                <div class="error-box">
                    <h1>❌ RFQ Not Found</h1>
                    <p>The quotation you're looking for does not exist or may have expired.</p>
                    <p><strong>ID searched:</strong> ${id}</p>
                    <p>Please contact the sender for a valid quotation link.</p>
                </div>
            </body>
            </html>
        `);
    }
    
    console.log('✅ Quotation FOUND for:', quotation.customerCompany);
    
    const isSubmitted = quotation.status === 'quoted';
    const subtotal = quotation.items.reduce((sum, item) => sum + (item.quantity * (item.price || 0)), 0);
    const tax = subtotal * ((quotation.taxRate || 0) / 100);
    const grandTotal = subtotal + tax + (quotation.shippingCost || 0);
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Submit Quotation - Primelink Sourcing</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; padding: 40px; }
                .container { max-width: 1000px; margin: 0 auto; background: white; border-radius: 20px; padding: 40px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); }
                .logo { text-align: center; margin-bottom: 20px; }
                .logo-circle { width: 60px; height: 60px; background: #667eea; border-radius: 50%; margin: 0 auto; line-height: 60px; }
                .logo-text { font-size: 24px; font-weight: bold; color: white; text-align: center; }
                h1 { color: #667eea; margin-bottom: 20px; }
                .info-box { background: #e8f4f8; padding: 15px; border-radius: 10px; margin: 20px 0; }
                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #667eea; color: white; }
                .price-input { width: 120px; padding: 8px; border: 1px solid #ddd; border-radius: 5px; }
                button { background: #28a745; color: white; border: none; padding: 14px 30px; border-radius: 8px; cursor: pointer; font-size: 16px; margin-top: 20px; width: 100%; }
                button:hover { background: #218838; }
                .message { margin-top: 20px; padding: 15px; border-radius: 8px; display: none; }
                .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                .submitted-box { background: #c3e6cb; padding: 20px; border-radius: 10px; text-align: center; }
                .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #999; }
                @media (max-width: 600px) { .info-grid { grid-template-columns: 1fr; } body { padding: 20px; } .price-input { width: 80px; } }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo"><div class="logo-circle"><span class="logo-text">PLS</span></div></div>
                
                ${isSubmitted ? `
                    <div class="submitted-box">
                        <h2>✅ QUOTATION ALREADY SUBMITTED</h2>
                        <p>You have already submitted your prices for this RFQ.</p>
                        <p>Submitted on: ${new Date(quotation.submittedAt).toLocaleString()}</p>
                        <p><strong>Your Grand Total:</strong> $${(quotation.grandTotal || 0).toFixed(2)}</p>
                    </div>
                ` : `
                    <h1>💰 Submit Your Quotation</h1>
                    <p>Please fill in your best prices for the items below.</p>
                    
                    <div class="info-grid">
                        <div class="info-box">
                            <strong>📋 BUYER:</strong><br>
                            Primelink Sourcing<br>
                            Email: sourcing@primelink.com
                        </div>
                        <div class="info-box">
                            <strong>📅 RFQ DETAILS:</strong><br>
                            Reference: PLS-${quotation.id.substring(0, 8).toUpperCase()}<br>
                            Issue Date: ${new Date(quotation.createdAt).toLocaleDateString()}<br>
                            Deadline: ${new Date(quotation.validUntil).toLocaleDateString()}
                        </div>
                    </div>
                    
                    ${quotation.notes ? `<div class="info-box"><strong>📝 Message from Buyer:</strong><br>${quotation.notes}</div>` : ''}
                    
                    <h3>Items & Your Pricing</h3>
                    <table id="itemsTable">
                        <thead>
                            <tr><th>Item Description</th><th>Quantity</th><th>Unit</th><th>Your Price (per unit)</th><th>Total</th></tr>
                        </thead>
                        <tbody>
                            ${quotation.items.map((item, index) => `
                                <tr data-index="${index}">
                                    <td>${item.name}</td>
                                    <td>${item.quantity}</td>
                                    <td>${item.unit || 'pcs'}</td>
                                    <td><input type="number" class="price-input" id="price_${index}" step="0.01" placeholder="Enter price" value="${item.price || ''}"></td>
                                    <td class="total_${index}">$${((item.price || 0) * item.quantity).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr><td colspan="4" style="text-align: right;"><strong>Subtotal:</strong></td><td id="subtotal">$${subtotal.toFixed(2)}</td></tr>
                            <tr><td colspan="4" style="text-align: right;"><strong>Tax (%):</strong></td><td><input type="number" id="taxRate" step="0.1" value="${quotation.taxRate || 0}" style="width: 80px;"> %</td></tr>
                            <tr><td colspan="4" style="text-align: right;"><strong>Shipping Cost:</strong></td><td><input type="number" id="shippingCost" step="0.01" value="${quotation.shippingCost || 0}" style="width: 100px;"></td></tr>
                            <tr style="background: #667eea; color: white;"><td colspan="4" style="text-align: right;"><strong>GRAND TOTAL:</strong></td><td id="grandTotal">$${grandTotal.toFixed(2)}</td></tr>
                        </tfoot>
                    </table>
                    
                    <div class="info-box">
                        <strong>📝 Additional Notes (optional):</strong><br>
                        <textarea id="sellerNotes" rows="3" style="width: 100%; margin-top: 10px; padding: 10px;" placeholder="Delivery terms, payment terms, validity of this quote...">${quotation.sellerNotes || ''}</textarea>
                    </div>
                    
                    <button onclick="submitQuotation()">📧 Submit Quotation to Buyer</button>
                    <div id="message" class="message"></div>
                `}
                
                <div class="footer">
                    This quotation request is from Primelink Sourcing.<br>
                    For questions, contact: sourcing@primelink.com
                </div>
            </div>
            
            <script>
                const quotationId = '${quotation.id}';
                const items = ${JSON.stringify(quotation.items)};
                
                function calculateTotals() {
                    let subtotal = 0;
                    
                    items.forEach((item, index) => {
                        const priceInput = document.getElementById(\`price_\${index}\`);
                        const price = parseFloat(priceInput?.value) || 0;
                        const total = price * item.quantity;
                        const totalCell = document.querySelector(\`.total_\${index}\`);
                        if (totalCell) totalCell.textContent = \`$\${total.toFixed(2)}\`;
                        subtotal += total;
                    });
                    
                    const taxRate = parseFloat(document.getElementById('taxRate')?.value) || 0;
                    const shippingCost = parseFloat(document.getElementById('shippingCost')?.value) || 0;
                    const tax = subtotal * (taxRate / 100);
                    const grandTotal = subtotal + tax + shippingCost;
                    
                    const subtotalEl = document.getElementById('subtotal');
                    const grandTotalEl = document.getElementById('grandTotal');
                    if (subtotalEl) subtotalEl.textContent = \`$\${subtotal.toFixed(2)}\`;
                    if (grandTotalEl) grandTotalEl.textContent = \`$\${grandTotal.toFixed(2)}\`;
                }
                
                function attachEventListeners() {
                    document.querySelectorAll('.price-input').forEach(input => {
                        input.removeEventListener('input', calculateTotals);
                        input.addEventListener('input', calculateTotals);
                    });
                    const taxRateEl = document.getElementById('taxRate');
                    const shippingEl = document.getElementById('shippingCost');
                    if (taxRateEl) {
                        taxRateEl.removeEventListener('input', calculateTotals);
                        taxRateEl.addEventListener('input', calculateTotals);
                    }
                    if (shippingEl) {
                        shippingEl.removeEventListener('input', calculateTotals);
                        shippingEl.addEventListener('input', calculateTotals);
                    }
                }
                
                async function submitQuotation() {
                    const prices = [];
                    let hasPrices = false;
                    
                    for (let i = 0; i < items.length; i++) {
                        const priceInput = document.getElementById(\`price_\${i}\`);
                        const price = parseFloat(priceInput?.value);
                        if (price > 0) hasPrices = true;
                        prices.push({
                            name: items[i].name,
                            quantity: items[i].quantity,
                            price: price || 0
                        });
                    }
                    
                    if (!hasPrices) {
                        alert('Please enter at least one price before submitting.');
                        return;
                    }
                    
                    const sellerNotes = document.getElementById('sellerNotes')?.value || '';
                    const taxRate = parseFloat(document.getElementById('taxRate')?.value) || 0;
                    const shippingCost = parseFloat(document.getElementById('shippingCost')?.value) || 0;
                    
                    const response = await fetch('/api/submit-prices', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            quotationId: quotationId,
                            prices: prices,
                            sellerNotes: sellerNotes,
                            taxRate: taxRate,
                            shippingCost: shippingCost
                        })
                    });
                    
                    const data = await response.json();
                    
                    const messageDiv = document.getElementById('message');
                    if (data.success) {
                        messageDiv.className = 'message success';
                        messageDiv.textContent = '✅ Quotation submitted successfully! The buyer will contact you shortly.';
                        messageDiv.style.display = 'block';
                        setTimeout(() => { window.location.reload(); }, 3000);
                    } else {
                        messageDiv.className = 'message error';
                        messageDiv.textContent = '❌ Error: ' + data.message;
                        messageDiv.style.display = 'block';
                    }
                }
                
                attachEventListeners();
                calculateTotals();
            </script>
        </body>
        </html>
    `);
});

// Submit prices from seller
app.post('/api/submit-prices', (req, res) => {
    const { quotationId, prices, sellerNotes, taxRate, shippingCost } = req.body;
    const success = updateQuotationStatus(quotationId, 'quoted', prices, sellerNotes, taxRate, shippingCost);
    
    if (success) {
        res.json({ success: true, message: 'Quotation submitted' });
    } else {
        res.json({ success: false, message: 'Quotation not found' });
    }
});

// Download PDF
app.get('/download/:id', (req, res) => {
    const id = req.params.id;
    const pdfPath = path.join(__dirname, 'quotations', `${id}.pdf`);
    if (fs.existsSync(pdfPath)) {
        res.download(pdfPath, `PLS-RFQ-${id.substring(0, 8)}.pdf`);
    } else {
        res.send('<h1>PDF not found</h1>');
    }
});

// Get all RFQs
app.get('/api/quotations', (req, res) => {
    const quotations = getQuotations();
    res.json({ success: true, count: quotations.length, quotations });
});

// Get submitted quotes
app.get('/api/submitted-quotes', (req, res) => {
    const submitted = JSON.parse(fs.readFileSync(SUBMITTED_QUOTES_FILE, 'utf8'));
    res.json({ success: true, count: submitted.length, submitted });
});

// Dashboard to view submitted quotes
app.get('/dashboard', (req, res) => {
    const quotations = getQuotations();
    const submittedQuotes = quotations.filter(q => q.status === 'quoted');
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Dashboard - Submitted Quotes</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; padding: 40px; }
                .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 20px; padding: 30px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); }
                h1 { color: #667eea; margin-bottom: 10px; }
                .stats { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
                .stat-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 15px; flex: 1; min-width: 150px; text-align: center; }
                .stat-number { font-size: 36px; font-weight: bold; }
                .stat-label { font-size: 14px; opacity: 0.9; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #667eea; color: white; }
                .status-pending { background: #ffc107; color: #333; padding: 4px 8px; border-radius: 5px; font-size: 12px; }
                .status-quoted { background: #28a745; color: white; padding: 4px 8px; border-radius: 5px; font-size: 12px; }
                .view-btn { background: #667eea; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; text-decoration: none; font-size: 12px; }
                .view-btn:hover { background: #5a67d8; }
                .quote-details { background: #f8f9fa; padding: 15px; border-radius: 10px; margin-top: 10px; display: none; }
                .quote-details.show { display: block; }
                .total-box { background: #e8f4f8; padding: 10px; border-radius: 8px; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📊 Primelink Sourcing Dashboard</h1>
                <p>View all RFQs and submitted quotations from sellers</p>
                
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-number">${quotations.length}</div>
                        <div class="stat-label">Total RFQs Sent</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${submittedQuotes.length}</div>
                        <div class="stat-label">Quotes Received</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${quotations.length - submittedQuotes.length}</div>
                        <div class="stat-label">Pending Response</div>
                    </div>
                </div>
                
                <h2>All Requests for Quotation (RFQ)</h2>
                <table>
                    <thead>
                        <tr><th>Date</th><th>Seller Company</th><th>Items</th><th>Status</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        ${quotations.map(q => `
                            <tr>
                                <td>${new Date(q.createdAt).toLocaleDateString()}</td>
                                <td><strong>${q.customerCompany}</strong><br><small>${q.customerName}</small></td>
                                <td>${q.items.length} items</td>
                                <td><span class="status-${q.status}">${q.status === 'quoted' ? '✓ QUOTE RECEIVED' : '⏳ PENDING'}</span></td>
                                <td><button class="view-btn" onclick="toggleDetails('${q.id}')">View Details</button></td>
                            </tr>
                            <tr id="details-${q.id}" style="display: none; background: #f8f9fa;">
                                <td colspan="5">
                                    <div style="padding: 20px;">
                                        <h3>📋 RFQ Details</h3>
                                        <p><strong>Seller:</strong> ${q.customerCompany}</p>
                                        <p><strong>Contact:</strong> ${q.customerName} (${q.customerEmail})</p>
                                        <p><strong>Date Sent:</strong> ${new Date(q.createdAt).toLocaleString()}</p>
                                        <p><strong>Valid Until:</strong> ${new Date(q.validUntil).toLocaleDateString()}</p>
                                        
                                        ${q.notes ? `<p><strong>Your Notes:</strong> ${q.notes}</p>` : ''}
                                        
                                        <h4>Items Requested:</h4>
                                        <table style="width: 100%; margin: 10px 0;">
                                            <thead><tr><th>Item</th><th>Quantity</th><th>Unit</th></tr></thead>
                                            <tbody>
                                                ${q.items.map(item => `<tr><td>${item.name}</td><td>${item.quantity}</td><td>${item.unit || 'pcs'}</td></tr>`).join('')}
                                            </tbody>
                                        </table>
                                        
                                        ${q.status === 'quoted' ? `
                                            <div style="background: #d4edda; padding: 20px; border-radius: 10px; margin-top: 20px;">
                                                <h3>💰 SELLER'S QUOTATION</h3>
                                                <p><strong>Submitted on:</strong> ${new Date(q.submittedAt).toLocaleString()}</p>
                                                <h4>Prices Submitted:</h4>
                                                <table style="width: 100%; margin: 10px 0;">
                                                    <thead><tr><th>Item</th><th>Quantity</th><th>Price per Unit</th><th>Total</th></tr></thead>
                                                    <tbody>
                                                        ${(q.submittedPrices || []).map(p => `
                                                            <tr>
                                                                <td>${p.name}</td>
                                                                <td>${p.quantity}</td>
                                                                <td>$${p.price.toFixed(2)}</td>
                                                                <td>$${(p.price * p.quantity).toFixed(2)}</td>
                                                            </tr>
                                                        `).join('')}
                                                    </tbody>
                                                </table>
                                                <div class="total-box">
                                                    <p><strong>Subtotal:</strong> $${(q.subtotal || 0).toFixed(2)}</p>
                                                    <p><strong>Tax (${q.taxRate || 0}%):</strong> $${((q.subtotal || 0) * (q.taxRate || 0) / 100).toFixed(2)}</p>
                                                    <p><strong>Shipping:</strong> $${(q.shippingCost || 0).toFixed(2)}</p>
                                                    <p style="font-size: 20px; margin-top: 10px;"><strong>GRAND TOTAL:</strong> $${(q.grandTotal || 0).toFixed(2)}</p>
                                                </div>
                                                ${q.sellerNotes ? `<p><strong>Seller's Notes:</strong> ${q.sellerNotes}</p>` : ''}
                                            </div>
                                        ` : `
                                            <div style="background: #fff3cd; padding: 20px; border-radius: 10px; margin-top: 20px;">
                                                <p>⏳ Waiting for seller to submit their quotation.</p>
                                                <p>The seller will click the link in the PDF to submit their prices.</p>
                                            </div>
                                        `}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <script>
                function toggleDetails(id) {
                    const row = document.getElementById('details-' + id);
                    if (row.style.display === 'none') {
                        row.style.display = 'table-row';
                    } else {
                        row.style.display = 'none';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Primelink Sourcing Platform running at http://localhost:${PORT}`);
    console.log(`📁 Data folder: ${path.join(__dirname, 'data')}`);
    console.log(`📁 PDF folder: ${path.join(__dirname, 'quotations')}`);
});