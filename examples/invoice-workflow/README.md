# Invoice Workflow Example

A simple invoice management system built with Daml and Canton, demonstrating a complete workflow where sellers can create invoices and buyers can pay them.

## Overview

This example implements a basic invoice workflow with the following features:
- **Sellers** can create invoices with details like amount, description, and due dates
- **Buyers** can view and pay submitted invoices
- Invoice status tracking (Pending → Paid)
- Multi-party authorization and visibility

## Prerequisites

- Docker with devcontainer support (VS Code recommended)
- Canton and Daml SDK (included in devcontainer)

## Quick Start Guide

### 1. Build the Contract

First, compile the Daml contract:

```bash
cd examples/invoice-workflow
daml build
```

This creates a `.dar` file in `.daml/dist/` directory.

### 2. Start the Canton Localnet

Open a new terminal and start the local Canton network:

```bash
make localnet
```

This starts:
- Two participant nodes (p1 on port 5011, p2 on port 5021)
- One synchronizer (domain) for transaction coordination
- All running in-memory for development

**Keep this terminal running** - it's your blockchain network!

### 3. Deploy the Contract

In a **new terminal**, deploy the compiled contract and run the setup script:

```bash
make deploy DAR=./examples/invoice-workflow/.daml/dist/invoice-workflow-0.0.1.dar SCRIPT=Main:setup
```

This will:
- Upload the DAR file to the ledger
- Run the `setup` script which creates test parties (AcmeCorp as seller, BuyerInc as buyer)
- Create an initial sample invoice

### 4. Start the Navigator GUI

In another **new terminal**, launch the Daml Navigator:

```bash
make nav
```

The Navigator UI will be available at: **http://localhost:7500**

## Using the Invoice Workflow

### Creating an Invoice (as Seller)

1. **Open Navigator**: Go to http://localhost:7500
2. **Login as Seller**: 
   - Click the user dropdown (top right)
   - Select or enter: `AcmeCorp` (or the full party ID shown)
3. **Navigate to Templates**:
   - Click "Template" in the top navigation
   - Find "Main:Invoice" template
4. **Fill Invoice Details**:
   - **seller**: AcmeCorp (auto-filled)
   - **buyer**: BuyerInc (select from dropdown)
   - **invoiceNumber**: e.g., "INV-002"
   - **amount**: e.g., 5000.00
   - **description**: e.g., "Consulting services for Q4 2024"
   - **issueDate**: e.g., 2025-11-06
   - **dueDate**: e.g., 2025-12-06
   - **status**: Select "Pending" from dropdown
5. **Submit**: Click the "Submit" button
6. **Verify**: Go to "Contract" tab to see your created invoice

### Paying an Invoice (as Buyer)

1. **Logout from Seller**:
   - Click the user dropdown (top right)
   - Logout
2. **Login as Buyer**:
   - Select or enter: `BuyerInc`
3. **View Invoices**:
   - Click "Contract" in the top navigation
   - You'll see invoices where you're the buyer
4. **Pay Invoice**:
   - Click on an invoice with status "Pending"
   - Find the "PayInvoice" choice in the choices section
   - Click "PayInvoice"
   - Confirm the action
5. **Verify Payment**:
   - The invoice status will change to "Paid"
   - A new contract version is created with updated status

## Project Structure

```
invoice-workflow/
├── daml/
│   └── Main.daml          # Invoice contract and setup script
├── daml.yaml              # Project configuration
└── README.md              # This file
```

## Contract Details

### Invoice Template

The `Invoice` template has the following fields:

- `seller`: Party who creates the invoice
- `buyer`: Party who pays the invoice
- `invoiceNumber`: Unique identifier (text)
- `amount`: Invoice amount (decimal)
- `description`: Service/product description
- `issueDate`: Date invoice was created
- `dueDate`: Payment due date
- `status`: Current status (Pending, Paid, or Cancelled)

### Available Choices

- **PayInvoice**: Allows buyer to mark invoice as paid (only for Pending invoices)
- **CancelInvoice**: Allows seller to cancel invoice (only for non-Paid invoices)

## Troubleshooting

### Port Already in Use

If you see port conflicts, check if services are already running:
```bash
lsof -i :5011  # Check Canton participant
lsof -i :7500  # Check Navigator
```

Kill existing processes or change ports in `infra/canton/localnet.conf`.

### Contract Not Visible

- Ensure you're logged in as the correct party (seller or buyer)
- Check that the invoice was created with the correct buyer party ID
- Verify the localnet is still running

### Deploy Fails

- Make sure the localnet is running first
- Check that the DAR file exists: `ls -la .daml/dist/`
- Rebuild if needed: `daml build`

## Stopping Services

To stop all services:

1. **Stop Navigator**: Press `Ctrl+C` in the Navigator terminal
2. **Stop Localnet**: Press `Ctrl+C` in the Canton terminal

## Next Steps

- Explore the Daml code in `daml/Main.daml`
- Modify the contract to add new fields or choices
- Try the JSON API for programmatic access: `make json-api`
- Read the [Daml documentation](https://docs.daml.com/) for advanced features

## Learn More

- [Daml Documentation](https://docs.daml.com/)
- [Canton Documentation](https://docs.daml.com/canton/index.html)
- [Daml Navigator Guide](https://docs.daml.com/tools/navigator/index.html)

