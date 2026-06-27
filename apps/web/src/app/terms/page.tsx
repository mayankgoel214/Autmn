import type { Metadata } from 'next';
import { site } from '@/site.config';
import { LegalLayout, H2, V } from '@/components/LegalLayout';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of {site.name}, a
        WhatsApp-based product-photography service operated by <V value={site.legal.entityName} />{' '}
        (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By using {site.name}, you agree to these Terms.
      </p>

      <H2>The service</H2>
      <p>
        {site.name} lets you send product photos over WhatsApp and receive AI-generated advertising
        images in return. You may provide instructions and brand details to guide the output.
      </p>

      <H2>Pricing &amp; payment</H2>
      <ul>
        <li>
          Each generated ad image costs <strong>{site.currency}{site.pricePerImage}</strong>.
        </li>
        <li>
          <strong>New customers&rsquo; first order is free</strong> — no payment is required for your
          first order.
        </li>
        <li>
          For subsequent orders, you pay {site.currency}{site.pricePerImage} per image based on the
          number of styles you select (e.g. 3 styles = {site.currency}
          {site.pricePerImage * 3}).
        </li>
        <li>Payments are collected via UPI through Razorpay before your ads are generated.</li>
        <li>All prices are in Indian Rupees (INR) and are inclusive of applicable taxes.</li>
      </ul>

      <H2>Delivery</H2>
      <p>
        Ads are typically delivered within a few minutes of a confirmed order, directly in your
        WhatsApp chat. Delivery times may occasionally vary due to demand or technical factors. This
        is a digital service — there is no physical shipment.
      </p>

      <H2>Your responsibilities</H2>
      <ul>
        <li>
          You confirm you have the right to use the product photos and brand materials you send, and
          that they do not infringe anyone else&rsquo;s rights.
        </li>
        <li>
          You will not use {site.name} to create misleading, unlawful, infringing, or harmful
          content.
        </li>
        <li>You are responsible for how you use the generated images in your own marketing.</li>
      </ul>

      <H2>Intellectual property</H2>
      <p>
        You retain rights to the product photos and brand materials you upload. Subject to full
        payment, you are granted the right to use the generated ad images for your business. You
        grant us a limited licence to process your content solely to provide and improve the
        service.
      </p>

      <H2>Refunds</H2>
      <p>
        Refunds are handled as described in our{' '}
        <a href="/refund">Refund &amp; Cancellation Policy</a>.
      </p>

      <H2>Service availability &amp; AI limitations</H2>
      <p>
        {site.name} relies on third-party AI systems. Results can vary, and the service is provided
        on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis without warranties of any
        kind. To the maximum extent permitted by law, our total liability for any claim relating to
        the service is limited to the amount you paid for the order in question.
      </p>

      <H2>Changes to these Terms</H2>
      <p>
        We may update these Terms from time to time. Continued use of {site.name} after changes
        means you accept the updated Terms.
      </p>

      <H2>Governing law</H2>
      <p>
        These Terms are governed by the laws of India. Any disputes are subject to the exclusive
        jurisdiction of the courts of <V value={site.legal.governingLawCity} />, India.
      </p>

      <H2>Contact</H2>
      <p>
        Questions about these Terms? Email{' '}
        <a href={`mailto:${site.email.support}`}>{site.email.support}</a>.
      </p>
    </LegalLayout>
  );
}
