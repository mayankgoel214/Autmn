import type { Metadata } from 'next';
import { site } from '@/site.config';
import { LegalLayout, H2 } from '@/components/LegalLayout';

export const metadata: Metadata = { title: 'Refund & Cancellation Policy' };

export default function Refund() {
  return (
    <LegalLayout title="Refund & Cancellation Policy">
      <p>
        We want you to be happy with your ads. This policy explains when and how you can get a
        refund for orders placed through {site.name}.
      </p>

      <H2>Free first order</H2>
      <p>
        Your first order is free, so there is nothing to refund on it. If you&rsquo;re not happy with
        a free order, simply send a new product and try again.
      </p>

      <H2>When you can request a refund</H2>
      <p>
        For paid orders, you can request a refund if something went wrong with your ad — for
        example, the result has a clear quality problem or does not reflect your product. Because
        each ad is generated specifically for you using AI, refunds are reviewed on a case-by-case
        basis.
      </p>

      <H2>How to request a refund</H2>
      <ol>
        <li>
          After your ads are delivered, tap <strong>&ldquo;Request refund&rdquo;</strong> in the
          WhatsApp chat.
        </li>
        <li>Tell us what went wrong — you can send a text message or a voice note.</li>
        <li>
          Our team reviews every request manually and replies with a decision, usually within{' '}
          <strong>24 hours</strong>.
        </li>
      </ol>

      <H2>If your refund is approved</H2>
      <p>
        Approved refunds are returned to your original payment method via Razorpay. Refunds
        typically reach your account within <strong>5&ndash;7 business days</strong>, depending on
        your bank.
      </p>

      <H2>If your refund is declined</H2>
      <p>
        If we&rsquo;re unable to approve a refund, we&rsquo;ll explain why. If you&rsquo;d like to
        discuss the decision, you can reach our support team and we&rsquo;ll be happy to help.
      </p>

      <H2>Cancellations</H2>
      <p>
        Orders are generated within minutes of payment, so an order cannot be cancelled once
        generation has started. If you have not yet paid, simply do not complete the payment and no
        charge will be made.
      </p>

      <H2>Contact</H2>
      <p>
        For any refund questions, email{' '}
        <a href={`mailto:${site.email.support}`}>{site.email.support}</a> or message us on WhatsApp.
      </p>
    </LegalLayout>
  );
}
