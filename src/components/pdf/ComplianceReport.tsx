import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { HealthScoreResult } from '@/lib/services/health/health-score'

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#111827' },
  header: { marginBottom: 30 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  date: { fontSize: 9, color: '#9CA3AF', marginTop: 8 },

  scoreSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 30, gap: 20 },
  scoreCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, justifyContent: 'center', alignItems: 'center' },
  scoreValue: { fontSize: 28, fontWeight: 'bold' },
  scoreLabel: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  scoreDesc: { fontSize: 10, color: '#6B7280' },

  sectionTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 10, marginTop: 20, color: '#111827' },

  table: { marginBottom: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: 8, borderBottomWidth: 1, borderColor: '#E5E7EB' },
  tableRow: { flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderColor: '#E5E7EB' },
  col1: { width: '30%', fontSize: 10 },
  col2: { width: '20%', fontSize: 10, textAlign: 'center' },
  col3: { width: '20%', fontSize: 10, textAlign: 'center' },
  col4: { width: '30%', fontSize: 10 },
  headerText: { fontWeight: 'bold', color: '#6B7280', fontSize: 9 },

  issueCard: { padding: 10, marginBottom: 6, backgroundColor: '#FEF2F2', borderRadius: 4 },
  issueTitle: { fontSize: 10, fontWeight: 'bold', color: '#EF4444' },
  issueBody: { fontSize: 9, color: '#6B7280', marginTop: 2 },

  recCard: { padding: 10, marginBottom: 6, backgroundColor: '#EFF6FF', borderRadius: 4 },
  recText: { fontSize: 10, color: '#2563EB' },

  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#9CA3AF' },

  disclaimer: { marginTop: 30, padding: 10, backgroundColor: '#F9FAFB', borderRadius: 4 },
  disclaimerText: { fontSize: 8, color: '#9CA3AF', lineHeight: 1.4 },
})

interface Props {
  companyName: string
  cin: string
  healthScore: HealthScoreResult
  generatedAt: string
}

const categoryNames: Record<string, string> = {
  mca: 'MCA Compliance',
  gst: 'GST Compliance',
  tax: 'Income Tax & TDS',
  labour: 'PF/ESI/Labour',
  corporate: 'State Compliance',
}

export function ComplianceReport({ companyName, cin, healthScore, generatedAt }: Props) {
  const scoreColor = healthScore.score >= 70 ? '#10B981' : healthScore.score >= 40 ? '#F59E0B' : '#EF4444'
  const scoreLabel = healthScore.score >= 80 ? 'Excellent' : healthScore.score >= 60 ? 'Good' : healthScore.score >= 40 ? 'Needs Attention' : 'Critical'

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>AUTMN</Text>
          <Text style={styles.subtitle}>Compliance Intelligence Report</Text>
          <Text style={styles.date}>Generated: {generatedAt} | {companyName} | {cin}</Text>
        </View>

        {/* Health Score */}
        <View style={styles.scoreSection}>
          <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
            <Text style={[styles.scoreValue, { color: scoreColor }]}>{healthScore.score}</Text>
          </View>
          <View>
            <Text style={[styles.scoreLabel, { color: scoreColor }]}>{scoreLabel}</Text>
            <Text style={styles.scoreDesc}>Compliance health score out of 100</Text>
          </View>
        </View>

        {/* Category Breakdown */}
        <Text style={styles.sectionTitle}>Category Breakdown</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.col1, styles.headerText]}>Category</Text>
            <Text style={[styles.col2, styles.headerText]}>Score</Text>
            <Text style={[styles.col3, styles.headerText]}>Max</Text>
            <Text style={[styles.col4, styles.headerText]}>Status</Text>
          </View>
          {Object.entries(healthScore.breakdown).map(([key, cat]) => (
            <View style={styles.tableRow} key={key}>
              <Text style={styles.col1}>{categoryNames[key] || key}</Text>
              <Text style={styles.col2}>{cat.score}</Text>
              <Text style={styles.col3}>{cat.max}</Text>
              <Text style={[styles.col4, { color: cat.score / cat.max >= 0.7 ? '#10B981' : cat.score / cat.max >= 0.4 ? '#F59E0B' : '#EF4444' }]}>
                {cat.score / cat.max >= 0.7 ? 'Good' : cat.score / cat.max >= 0.4 ? 'Needs Work' : 'Critical'}
              </Text>
            </View>
          ))}
        </View>

        {/* Issues */}
        {healthScore.issues.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Issues ({healthScore.issues.length})</Text>
            {healthScore.issues.slice(0, 10).map((issue, i) => (
              <View style={styles.issueCard} key={i}>
                <Text style={styles.issueTitle}>{issue.severity.toUpperCase()}: {issue.category.toUpperCase()}</Text>
                <Text style={styles.issueBody}>{issue.message}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recommendations */}
        {healthScore.recommendations.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Recommendations</Text>
            {healthScore.recommendations.map((rec, i) => (
              <View style={styles.recCard} key={i}>
                <Text style={styles.recText}>{rec}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            This report is generated by AUTMN for informational purposes. It is based on available filing data and company profile information. This is not a substitute for professional CA advice. AUTMN is an assistant tool — the company and its directors are responsible for ensuring compliance.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>AUTMN Compliance Intelligence</Text>
          <Text style={styles.footerText}>Confidential — {companyName}</Text>
        </View>
      </Page>
    </Document>
  )
}
