import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceData {
  garage: {
    name: string;
    phone: string | null;
    email: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    postcode: string | null;
    website: string | null;
    vatNumber: string | null;
  };
  title: string; // "QUOTE" or "INVOICE"
  reference: string; // Q-DUD-2026-00001 or INV-DUD-2026-00001
  date: string;
  /** Migration 046 — when set, renders a diagonal PAID watermark on
   *  the page. Null for quotes and unpaid invoices. */
  paid?: {
    at: string; // formatted date
    method: string; // "Cash" / "Card" / ...
  } | null;
  customer: {
    fullName: string;
    phone: string;
    email: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    postcode: string | null;
  };
  vehicle: {
    registration: string;
    make: string | null;
    model: string | null;
    mileage: number | null;
  };
  lineItems: {
    type: string;
    description: string;
    quantity: number;
    unitPricePence: number;
    totalPence: number;
  }[];
  subtotalPence: number;
  vatPence: number;
  grandTotalPence: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

// V046 — PAID watermark styles. Using a separate StyleSheet so the
// main invoice styles stay focused on line-item layout.
const paidWatermarkStyle = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: "38%",
    left: 0,
    right: 0,
    alignItems: "center",
    opacity: 0.18,
    transform: "rotate(-18deg)",
  },
  stamp: {
    fontSize: 96,
    fontWeight: "bold",
    color: "#1a7f37",
    letterSpacing: 8,
  },
  caption: {
    fontSize: 14,
    color: "#1a7f37",
    marginTop: 4,
    letterSpacing: 2,
  },
});

// ---------------------------------------------------------------------------
// Styles — clean, minimal, data-focused
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#333",
  },
  // Header: garage details
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#DDD",
    paddingBottom: 12,
  },
  garageName: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  garageDetail: {
    fontSize: 8,
    color: "#666",
    marginBottom: 1,
  },
  // Title row
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
  },
  refBlock: {
    textAlign: "right",
  },
  refLabel: {
    fontSize: 8,
    color: "#666",
  },
  refValue: {
    fontSize: 10,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
  },
  // Customer + vehicle info
  infoRow: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 40,
  },
  infoCol: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 8,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: "#666",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  infoText: {
    fontSize: 9,
    marginBottom: 2,
  },
  // Table
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#EEE",
    paddingVertical: 4,
  },
  colType: { width: "12%", fontSize: 8, color: "#666" },
  colDesc: { width: "40%", paddingRight: 8 },
  colQty: { width: "12%", textAlign: "right" },
  colPrice: { width: "18%", textAlign: "right" },
  colTotal: { width: "18%", textAlign: "right", fontWeight: "bold", fontFamily: "Helvetica-Bold" },
  headerText: {
    fontSize: 8,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: "#666",
  },
  // Totals
  totalsBlock: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingTop: 8,
    alignItems: "flex-end",
  },
  totalRow: {
    flexDirection: "row",
    width: 200,
    justifyContent: "space-between",
    marginBottom: 3,
  },
  totalLabel: {
    fontSize: 9,
  },
  totalValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  grandTotalRow: {
    flexDirection: "row",
    width: 200,
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingTop: 4,
    marginTop: 4,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
  },
  grandTotalValue: {
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 40,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#DDD",
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: "#999",
    marginBottom: 1,
  },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  const { garage, title, reference, date, customer, vehicle, lineItems, paid } = data;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* V046 — PAID watermark. Diagonal, low-opacity green stamp
         *  that sits behind the content. Only renders when the
         *  invoice has been recorded as paid so it doesn't get stuck
         *  on quotes or unpaid invoices. */}
        {paid ? (
          <View fixed style={paidWatermarkStyle.wrapper}>
            <Text style={paidWatermarkStyle.stamp}>PAID</Text>
            <Text style={paidWatermarkStyle.caption}>
              {paid.at} · {paid.method}
            </Text>
          </View>
        ) : null}

        {/* Garage header */}
        <View style={s.header}>
          <Text style={s.garageName}>{garage.name}</Text>
          {garage.addressLine1 && <Text style={s.garageDetail}>{garage.addressLine1}{garage.postcode ? `, ${garage.postcode}` : ""}{garage.addressLine2 ? `, ${garage.addressLine2}` : ""}</Text>}
          {garage.phone && <Text style={s.garageDetail}>Tel: {garage.phone}</Text>}
          {garage.email && <Text style={s.garageDetail}>Email: {garage.email}</Text>}
          {garage.website && <Text style={s.garageDetail}>{garage.website}</Text>}
          {garage.vatNumber && <Text style={s.garageDetail}>VAT: {garage.vatNumber}</Text>}
        </View>

        {/* Title + reference */}
        <View style={s.titleRow}>
          <Text style={s.title}>{title}</Text>
          <View style={s.refBlock}>
            <Text style={s.refLabel}>Reference</Text>
            <Text style={s.refValue}>{reference}</Text>
            <Text style={s.refLabel}>Date</Text>
            <Text style={s.refValue}>{date}</Text>
          </View>
        </View>

        {/* Customer + Vehicle */}
        <View style={s.infoRow}>
          <View style={s.infoCol}>
            <Text style={s.infoTitle}>Customer</Text>
            <Text style={s.infoText}>{customer.fullName}</Text>
            {customer.addressLine1 && <Text style={s.infoText}>{customer.addressLine1}</Text>}
            {(customer.addressLine2 || customer.postcode) && (
              <Text style={s.infoText}>{[customer.addressLine2, customer.postcode].filter(Boolean).join(" ")}</Text>
            )}
            <Text style={s.infoText}>{customer.phone}</Text>
            {customer.email && <Text style={s.infoText}>{customer.email}</Text>}
          </View>
          <View style={s.infoCol}>
            <Text style={s.infoTitle}>Vehicle</Text>
            <Text style={s.infoText}>{vehicle.registration}</Text>
            <Text style={s.infoText}>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"}</Text>
            {vehicle.mileage != null && <Text style={s.infoText}>Mileage: {vehicle.mileage.toLocaleString()}</Text>}
          </View>
        </View>

        {/* Line items table */}
        <View style={s.tableHeader}>
          <Text style={[s.headerText, s.colType]}>Type</Text>
          <Text style={[s.headerText, s.colDesc]}>Description</Text>
          <Text style={[s.headerText, s.colQty]}>Qty</Text>
          <Text style={[s.headerText, s.colPrice]}>Unit Price</Text>
          <Text style={[s.headerText, s.colTotal]}>Total</Text>
        </View>

        {lineItems.map((item, i) => (
          <View key={i} style={s.tableRow}>
            <Text style={s.colType}>{item.type}</Text>
            <Text style={s.colDesc}>{item.description}</Text>
            <Text style={s.colQty}>{item.quantity}</Text>
            <Text style={s.colPrice}>{pounds(item.unitPricePence)}</Text>
            <Text style={s.colTotal}>{pounds(item.totalPence)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={s.totalsBlock}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{pounds(data.subtotalPence)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>VAT (20%)</Text>
            <Text style={s.totalValue}>{pounds(data.vatPence)}</Text>
          </View>
          <View style={s.grandTotalRow}>
            <Text style={s.grandTotalLabel}>Total</Text>
            <Text style={s.grandTotalValue}>{pounds(data.grandTotalPence)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>Balance due upon completion of the work.</Text>
          <Text style={s.footerText}>If additional repairs are needed, you will be contacted for approval before proceeding.</Text>
          <Text style={s.footerText}>Quotation validity: one month from date of issue.</Text>
        </View>
      </Page>
    </Document>
  );
}
