// assets/js/sales.js — Konfigurasi halaman Penjualan (sales.html). Logika ada di transaction-page.js.
import { initTransactionPage } from './transaction-page.js';

initTransactionPage({
  table: 'sales', noField: 'invoice_no', dateField: 'sale_date',
  partyTable: 'customers', partyParam: 'p_customer_id', dateParam: 'p_sale_date', partyNone: 'Pelanggan umum',
  createRpc: 'create_sale', cancelRpc: 'cancel_sale', cancelParam: 'p_sale_id',
  priceField: 'unit_price', defaultPriceKey: 'sell_price', limitByStock: true,
  savedText: 'Penjualan tersimpan.', canceledText: 'Penjualan dibatalkan.',
});
