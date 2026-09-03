import type { Metadata } from 'next';
import { site } from '@/site.config';
import { LegalLayout, H2, V } from '@/components/LegalLayout';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        This Privacy Policy explains how <V value={site.legal.entityName} /> (&ldquo;{site.name}
        &rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, and protects your information
        when you use our WhatsApp-based product-photography service at {site.domain}. We are
        committed to handling your data responsibly and in line with India&rsquo;s Digital Personal
        Data Protection Act, 2023 (DPDP Act).
      </p>

      <H2>Information we collect</H2>
      <ul>
        <li>
          <strong>Your WhatsApp phone number</strong> — used as your account identity to deliver
          your orders and provide support.
        </li>
        <li>
          <strong>Product photos you send</strong> — the images you upload so we can generate ads
          for you.
        </li>
        <li>
          <strong>Brand details you choose to share</strong> — your brand name, category, and any
          logos, samples, descriptions, or website links you send during setup.
        </li>
        <li>
          <strong>Instructions you provide</strong> — text or voice notes describing how you want
          your ad to look. Voice notes are transcribed to text.
        </li>
        <li>
          <strong>Order and payment records</strong> — what you ordered and your payment status.
          Payments are processed by Razorpay; we do not store your card or UPI credentials.
        </li>
      </ul>

      <H2>How we use your information</H2>
      <ul>
        <li>To generate your product ads and deliver them to you on WhatsApp.</li>
        <li>To remember your brand preferences so future orders are better and faster.</li>
        <li>To process payments and refunds.</li>
        <li>To provide customer support and respond to your messages.</li>
        <li>To improve the quality and reliability of our service.</li>
      </ul>

      <H2>How your images are processed</H2>
      <p>
        To create your ads, your product photos are processed by trusted third-party AI providers
        (including Google Gemini, OpenAI, and fal.ai) and stored on our infrastructure (Supabase).
        Your images are used only to fulfil your order and improve your results — they are not sold.
        Customer-supplied content such as product photos, voice notes, and refund attachments is
        automatically deleted after a retention period (currently 30 days).
      </p>

      <H2>Sharing your information</H2>
      <p>
        We do not sell your personal data. We share data only with service providers who help us run
        Marquee — payment processing (Razorpay), messaging (WhatsApp / Meta), AI generation, cloud
        storage, and error monitoring — and only to the extent needed to provide the service, or
        when required by law.
      </p>

      <H2>Data retention</H2>
      <p>
        Customer-supplied content (product photos, voice notes, refund-reason recordings) is
        retained for up to 30 days and then automatically deleted. Account information (phone number,
        brand profile, order history) is retained for as long as your account is active or as needed
        to comply with legal obligations.
      </p>

      <H2>Your rights</H2>
      <p>
        Under the DPDP Act, you have the right to access, correct, and request deletion of your
        personal data, and to withdraw consent. To exercise any of these rights, message us on
        WhatsApp or email <a href={`mailto:${site.email.support}`}>{site.email.support}</a>.
      </p>

      <H2>Children</H2>
      <p>
        Marquee is a business tool intended for sellers aged 18 and over. We do not knowingly collect
        data from children.
      </p>

      <H2>Contact</H2>
      <p>
        For any privacy questions or requests, contact <V value={site.legal.entityName} /> at{' '}
        <a href={`mailto:${site.email.support}`}>{site.email.support}</a>, or by post at{' '}
        {[site.legal.address, site.legal.city, site.legal.state, site.legal.pincode, site.legal.country]
          .filter(Boolean)
          .join(', ')}
        .
      </p>
    </LegalLayout>
  );
}
