/* eslint-disable @typescript-eslint/no-explicit-any */
import { pdf } from '@react-pdf/renderer';
import { ResearchBriefPDF } from '../components/ResearchBriefPDF';

export async function exportResearchBrief(data: any) {
  try {
    const briefId = `AGOS-${data.ticker}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const doc = <ResearchBriefPDF data={{ ...data, briefId }} />;
    const blob = await pdf(doc).toBlob();
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AGOS_BRIEF_${data.ticker}_${new Date().toISOString().split('T')[0]}.pdf`;
    
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export PDF brief:', error);
    throw error;
  }
}
