import { SectionHeader, Card } from './shared.jsx';
import EmailSettingsForm from '../settings/EmailSettingsForm.jsx';

/**
 * Desktop dashboard section for SMTP. Shares the same form as the mobile
 * Settings collapsible — just lays it out in a Card with a section header.
 */
export default function EmailSection() {
  return (
    <>
      <SectionHeader
        title="📧 הגדרות שרת SMTP"
        subtitle="הגדרות אלו ישמשו לשליחת הזמנות, איפוס סיסמה ושאר הודעות מערכת"
      />
      <Card>
        <EmailSettingsForm />
      </Card>
    </>
  );
}
