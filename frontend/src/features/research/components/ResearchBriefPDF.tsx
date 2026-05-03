/* eslint-disable @typescript-eslint/no-explicit-any */
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#030303',
    color: '#f4f4f0',
    fontFamily: 'Helvetica',
    padding: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 20,
    marginBottom: 30,
  },
  brand: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 2,
  },
  meta: {
    fontSize: 10,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.5)',
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    paddingBottom: 5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  label: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
  },
  value: {
    fontSize: 10,
    fontFamily: 'Courier',
  },
  companyName: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 5,
  },
  ticker: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 20,
  },
  priceLarge: {
    fontSize: 32,
    fontFamily: 'Helvetica-Bold',
  },
  signalBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  signalItem: {
    width: '48%',
    padding: 10,
    backgroundColor: '#0a0b0b',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 10,
  },
  signalValue: {
    fontSize: 12,
    fontFamily: 'Courier-Bold',
    marginTop: 5,
  },
  newsItem: {
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  newsHeadline: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
  },
  newsSummary: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.4,
  },
  newsMeta: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 5,
    fontFamily: 'Courier',
  },
  positive: { color: '#6ee7a8' },
  negative: { color: '#ff7a7a' },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 5,
    marginBottom: 5,
  },
  tableCol: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
  },
  tableCell: {
    fontSize: 8,
    fontFamily: 'Courier',
  },
  chartImage: {
    width: '100%',
    height: 200,
    marginTop: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  }
});

interface ResearchBriefProps {
  data: {
    overview: any;
    signals: any[];
    news: any[];
    macro: any[];
    financials: any;
    ticker: string;
    timestamp: string;
    briefId: string;
    chartImage?: string | null;
  };
}

export const ResearchBriefPDF = ({ data }: ResearchBriefProps) => (
  <Document title={`AGOS Intelligence Brief - ${data.ticker}`}>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>AGOS</Text>
          <Text style={styles.label}>Intelligence Terminal</Text>
        </View>
        <View style={styles.meta}>
          <Text>CONFIDENTIAL BRIEF</Text>
          <Text>{data.timestamp}</Text>
          <Text>ID: {data.briefId}</Text>
        </View>
      </View>

      {/* Company Summary */}
      <View style={styles.section}>
        <Text style={styles.companyName}>{data.overview?.companyName || 'N/A'}</Text>
        <Text style={styles.ticker}>{data.ticker} · Market Research Data</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 20 }}>
          <View>
            <Text style={styles.priceLarge}>{data.overview?.price ? `₱${data.overview.price.toLocaleString()}` : '---'}</Text>
            <Text style={styles.label}>Current Market Price</Text>
          </View>
        </View>
      </View>

      {/* Chart Section */}
      {data.chartImage && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Action Performance</Text>
          <Image src={data.chartImage} style={styles.chartImage} />
        </View>
      )}

      {/* Signals Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Research Signals</Text>
        <View style={styles.signalBox}>
          {data.signals.map((signal, i) => (
            <View key={i} style={styles.signalItem}>
              <Text style={styles.label}>{signal.label}</Text>
              <Text style={[
                styles.signalValue,
                signal.value === 'BULLISH' ? styles.positive : 
                signal.value === 'BEARISH' ? styles.negative : {}
              ]}>
                {signal.value}
              </Text>
              <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{signal.detail}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Macro Indicators */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Macro Indicators</Text>
        {data.macro.slice(0, 5).map((item, i) => (
          <View key={i} style={styles.row}>
            <View>
              <Text style={styles.label}>{item.indicator || item.name}</Text>
              <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>{item.date || item.period}</Text>
            </View>
            <Text style={styles.value}>{item.value}</Text>
          </View>
        ))}
      </View>

      {/* News Section */}
      <PageBreakPlaceholder />
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Latest News Intelligence</Text>
        {data.news.map((item, i) => (
          <View key={i} style={styles.newsItem}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.newsHeadline}>{item.headline || item.title}</Text>
              <Text style={[
                styles.label, 
                String(item.sentiment_label).toLowerCase() === 'bullish' ? styles.positive :
                String(item.sentiment_label).toLowerCase() === 'bearish' ? styles.negative : {}
              ]}>
                {item.sentiment_label || 'Neutral'}
              </Text>
            </View>
            <Text style={styles.newsSummary}>{item.summary}</Text>
            <Text style={styles.newsMeta}>{item.date} · Sentiment Score: {item.sentiment_score}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.label, { position: 'absolute', bottom: 40, left: 40 }]}>
        Generated by AGOS Intelligence System. All model outputs are probabilistic.
      </Text>
      <Text style={[styles.label, { position: 'absolute', bottom: 40, right: 40 }]}>
        Page 1
      </Text>
    </Page>

    {/* Page 2: Financial Statements */}
    {(data.financials?.yearly || data.financials?.quarterly) && (
      <Page size="A4" style={styles.page}>
         <View style={styles.header}>
          <View>
            <Text style={styles.brand}>AGOS</Text>
            <Text style={styles.label}>Intelligence Terminal</Text>
          </View>
          <View style={styles.meta}>
            <Text>FINANCIAL SUPPLEMENT</Text>
            <Text>{data.ticker}</Text>
          </View>
        </View>

        {data.financials.yearly && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Yearly Financial Snapshot</Text>
            <View style={styles.tableHeader}>
               <Text style={[styles.tableCol, { width: '40%' }]}>Metric</Text>
               <Text style={[styles.tableCol, { width: '60%', textAlign: 'right' }]}>Value</Text>
            </View>
            {Object.entries(data.financials.yearly).map(([key, value]: [string, any], i) => {
              if (typeof value === 'object' || Array.isArray(value)) return null;
              return (
                <View key={i} style={styles.row}>
                  <Text style={[styles.tableCell, { width: '40%', color: 'rgba(255,255,255,0.6)' }]}>{key}</Text>
                  <Text style={[styles.tableCell, { width: '60%', textAlign: 'right' }]}>{String(value)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {data.financials.quarterly && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quarterly Financial Snapshot</Text>
            <View style={styles.tableHeader}>
               <Text style={[styles.tableCol, { width: '40%' }]}>Metric</Text>
               <Text style={[styles.tableCol, { width: '60%', textAlign: 'right' }]}>Value</Text>
            </View>
            {Object.entries(data.financials.quarterly).map(([key, value]: [string, any], i) => {
              if (typeof value === 'object' || Array.isArray(value)) return null;
              return (
                <View key={i} style={styles.row}>
                  <Text style={[styles.tableCell, { width: '40%', color: 'rgba(255,255,255,0.6)' }]}>{key}</Text>
                  <Text style={[styles.tableCell, { width: '60%', textAlign: 'right' }]}>{String(value)}</Text>
                </View>
              );
            })}
          </View>
        )}

        <Text style={[styles.label, { position: 'absolute', bottom: 40, left: 40 }]}>
          Generated by AGOS Intelligence System. Supplementary financial data.
        </Text>
        <Text style={[styles.label, { position: 'absolute', bottom: 40, right: 40 }]}>
          Page 2
        </Text>
      </Page>
    )}
  </Document>
);

const PageBreakPlaceholder = () => <View style={{ height: 20 }} />;
