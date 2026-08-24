import type { Metadata } from 'next';
import { site, whatsappLink, isPlaceholder } from '@/site.config';
import { LegalLayout, H2, V } from '@/components/LegalLayout';

export const metadata: Metadata = { title: 'Contact' };

export default function Contact() {
  return (
    <LegalLayout title="Contact Us">
      <p>
        We&rsquo;d love to hear from you. Reach {site.name} through any of the channels below.
      </p>

      <H2>Business details</H2>
      <ul>
        <li>
          <strong>Business name:</strong> <V value={site.legal.entityName} />
        </li>
        <li>
          <strong>Entity type:</strong> <V value={site.legal.entityType} />
        </li>
        <li>
          <strong>Registered address:</strong>{' '}
          {[site.legal.address, site.legal.city, site.legal.state, site.legal.pincode, site.legal.country]
            .filter(Boolean)
            .join(', ')}
        </li>
        {site.legal.gstin ? (
          <li>
            <strong>GSTIN:</strong> {site.legal.gstin}
          </li>
        ) : null}
      </ul>

      <H2>Get in touch</H2>
      <ul>
        <li>
          <strong>Email:</strong>{' '}
          <a href={`mailto:${site.email.support}`}>{site.email.support}</a>
        </li>
        <li>
          <strong>WhatsApp:</strong>{' '}
          {isPlaceholder(site.whatsappNumber) ? (
            <V value={site.whatsappNumber} />
          ) : (
            <a href={whatsappLink()}>Message us on WhatsApp</a>
          )}
        </li>
      </ul>

      <p>
        For support and refund requests, the fastest way to reach us is directly in your WhatsApp
        chat with {site.name}.
      </p>
    </LegalLayout>
  );
}
