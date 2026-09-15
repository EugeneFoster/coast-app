import assert from "node:assert/strict";
import { parseStrategiTables } from "../src/lib/suppliers/strategi-table.ts";

// Reduced from the authenticated ProductList structure. The Order column's
// nested table must not shift Avail or Code to another index.
const html = `
  <script>const fake = '<table><tr><td>wrong</td></tr></table>';</script>
  <table class="products" data-note="a > b">
    <tr><th>Brand</th><th>Mfg Part Number</th><th>Description</th><th>S</th>
      <th>Page</th><th>Pack</th><th>SRP</th><th>Per</th><th>History</th>
      <th>Net</th><th>/Qty</th><th>Order</th><th>Avail</th><th>Value</th>
      <th>Total</th><th>Notes</th><th>Code</th></tr>
    <tr><td>SIERRA</td><td>18-7420</td><td>O&#45;RING&nbsp;&amp; SEAL</td>
      <td>R</td><td></td><td>5</td><td>0.47</td><td>EA</td><td></td>
      <td><p>0.28</p></td><td><p>/1</p></td>
      <td><table><tr><td>0</td></tr><tr><td>Minimum 2</td></tr></table></td>
      <td>3</td><td>0.00</td><td>0</td><td>*</td><td>560375</td></tr>
    <tr><td>SIERRA</td><td>18-74527</td><td>GEAR HOUSING SEAL KIT</td>
      <td>R</td><td></td><td>1</td><td>111.24</td><td>EA</td><td></td>
      <td>66.61</td><td>/1</td><td>0</td><td>No<br>10/22/26</td>
      <td>0.00</td><td>0</td><td>*</td><td>1878859</td></tr>
  </table>`;

const tables = parseStrategiTables(html);
const product = tables.find((table) => table.rows[0]?.cells[1]?.text === "Mfg Part Number");
assert.ok(product);
assert.equal(product.rows[1].cells.length, 17);
assert.equal(product.rows[1].cells[1].text, "18-7420");
assert.equal(product.rows[1].cells[2].text, "O-RING & SEAL");
assert.equal(product.rows[1].cells[9].text, "0.28");
assert.equal(product.rows[1].cells[11].text, "0 Minimum 2");
assert.equal(product.rows[1].cells[12].text, "3");
assert.equal(product.rows[1].cells[16].text, "560375");
assert.equal(product.rows[2].cells[12].text, "No 10/22/26");
assert.equal(tables.filter((table) => table.rows[0]?.cells[0]?.text === "wrong").length, 0);

console.log("Western Marine Strategi table checks passed.");
