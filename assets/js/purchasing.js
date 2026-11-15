// assets/js/purchasing.js — Konfigurasi halaman Pembelian (purchasing.html). Logika ada di transaction-page.js.
import { initTransactionPage } from './transaction-page.js';

initTransactionPage({
  table: 'purchases', noField: 'purchase_no', dateField: 'purchase_date',
  partyTable: 'suppliers', partyParam: 'p_supplier_id', dateParam: 'p_purchase_date', partyNone: 'Tanpa pemasok',
  createRpc: 'create_purchase', cancelRpc: 'cancel_purchase', cancelParam: 'p_purchase_id',
  priceField: 'unit_cost', defaultPriceKey: 'buy_price', limitByStock: false,
  savedText: 'Pembelian tersimpan.', canceledText: 'Pembelian dibatalkan.',
});
