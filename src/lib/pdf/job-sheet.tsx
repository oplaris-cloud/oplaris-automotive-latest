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

export interface JobSheetData {
  garage: { name: string };
  job: {
    jobNumber: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
    description: string | null;
  };
  customer: {
    fullName: string;
    phone: string;
    email: string | null;
  };
  vehicle: {
    registration: string;
    make: string | null;
    model: string | null;
    year: number | null;
    mileage: number | null;
  };
  labourLines: {
    taskType: string;
    description: string | null;
    durationSeconds: number | null;
    staffName: string;
  }[];
  partsLines: {
    description: string;
    supplier: string;
    quantity: number;
    unitPricePence: number;
    totalPence: number;
  }[];
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: "bold" },
  subtitle: { fontSize: 10, color: "#666", marginTop: 4 },
  proforma: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#c00",
    textAlign: "center",
    marginBottom: 15,
    padding: 6,
    borderWidth: 1,
    borderColor: "#c00",
  },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 4, borderBottomWidth: 1, borderBottomColor: "#ccc", paddingBottom: 2 },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: 100, fontWeight: "bold" },
  value: { flex: 1 },
  table: { marginTop: 6 },
  tableHeader: { flexDirection: "row", fontWeight: "bold", borderBottomWidth: 1, borderBottomColor: "#333", paddingBottom: 3, marginBottom: 3 },
  tableRow: { flexDirection: "row", paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: "#ddd" },
  colDesc: { flex: 3 },
  colQty: { width: 40, textAlign: "right" },
  colPrice: { width: 70, textAlign: "right" },
  colTotal: { width: 70, textAlign: "right" },
  totalRow: { flexDirection: "row", marginTop: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: "#333" },
  totalLabel: { flex: 1, fontWeight: "bold", textAlign: "right", paddingRight: 10 },
  totalValue: { width: 70, textAlign: "right", fontWeight: "bold" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#999", textAlign: "center" },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pence(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

function duration(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JobSheetDocument({ data }: { data: JobSheetData }) {
  const partsTotalPence = data.partsLines.reduce((sum, l) => sum + l.totalPence, 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>{data.garage.name}</Text>
          <Text style={s.subtitle}>
            Job Sheet {data.job.jobNumber} — {fmtDate(data.job.createdAt)}
          </Text>
        </View>

        <Text style={s.proforma}>PRO-FORMA — NOT A VAT INVOICE</Text>

        {/* Customer */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Customer</Text>
          <View style={s.row}>
            <Text style={s.label}>Name</Text>
            <Text style={s.value}>{data.customer.fullName}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Phone</Text>
            <Text style={s.value}>{data.customer.phone}</Text>
          </View>
          {data.customer.email ? (
            <View style={s.row}>
              <Text style={s.label}>Email</Text>
              <Text style={s.value}>{data.customer.email}</Text>
            </View>
          ) : null}
        </View>

        {/* Vehicle */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Vehicle</Text>
          <View style={s.row}>
            <Text style={s.label}>Registration</Text>
            <Text style={s.value}>{data.vehicle.registration}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Make / Model</Text>
            <Text style={s.value}>
              {[data.vehicle.make, data.vehicle.model].filter(Boolean).join(" ") || "—"}
            </Text>
          </View>
          {data.vehicle.year ? (
            <View style={s.row}>
              <Text style={s.label}>Year</Text>
              <Text style={s.value}>{data.vehicle.year}</Text>
            </View>
          ) : null}
          {data.vehicle.mileage != null ? (
            <View style={s.row}>
              <Text style={s.label}>Mileage</Text>
              <Text style={s.value}>{data.vehicle.mileage.toLocaleString("en-GB")}</Text>
            </View>
          ) : null}
        </View>

        {/* Description */}
        {data.job.description ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Work Description</Text>
            <Text>{data.job.description}</Text>
          </View>
        ) : null}

        {/* Labour */}
        {data.labourLines.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Labour</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={s.colDesc}>Task</Text>
                <Text style={s.colQty}>Time</Text>
                <Text style={s.colPrice}>Technician</Text>
              </View>
              {data.labourLines.map((l, i) => (
                <View key={i} style={s.tableRow}>
                  <Text style={s.colDesc}>
                    {l.taskType.replace(/_/g, " ")}{l.description ? ` — ${l.description}` : ""}
                  </Text>
                  <Text style={s.colQty}>{duration(l.durationSeconds)}</Text>
                  <Text style={s.colPrice}>{l.staffName}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Parts */}
        {data.partsLines.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Parts</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={s.colDesc}>Description</Text>
                <Text style={s.colQty}>Qty</Text>
                <Text style={s.colPrice}>Unit</Text>
                <Text style={s.colTotal}>Total</Text>
              </View>
              {data.partsLines.map((p, i) => (
                <View key={i} style={s.tableRow}>
                  <Text style={s.colDesc}>{p.description} ({p.supplier})</Text>
                  <Text style={s.colQty}>{p.quantity}</Text>
                  <Text style={s.colPrice}>{pence(p.unitPricePence)}</Text>
                  <Text style={s.colTotal}>{pence(p.totalPence)}</Text>
                </View>
              ))}
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Parts Total</Text>
                <Text style={s.totalValue}>{pence(partsTotalPence)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Footer */}
        <Text style={s.footer}>
          Generated {new Date().toLocaleDateString("en-GB")} — {data.garage.name} — Job {data.job.jobNumber}
        </Text>
      </Page>
    </Document>
  );
}
