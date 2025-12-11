# Bank Transfer Payment Gateway

A custom Frappe app that adds Bank Transfer as a payment method for Frappe LMS.

## Features

- Bank Transfer Settings DocType to store bank account details
- Payment instructions page for customers
- Integration with Frappe LMS payment flow
- Order reference generation for tracking payments

## Installation

### Using Bench

```bash
# Get the app
bench get-app https://github.com/yourusername/bank_transfer_gateway

# Install on your site
bench --site your-site.local install-app bank_transfer_gateway
```

### Using Docker

See the Docker installation section in the documentation.

## Configuration

1. Go to **Bank Transfer Settings** in the desk
2. Add your bank account details
3. Go to **Payment Gateway** and create a new entry pointing to Bank Transfer
4. In LMS Settings, select the payment gateway

## License

MIT

