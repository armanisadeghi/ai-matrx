/**
 * Verbatim assistant output captured from the live walk of 2026-10-04
 * (chat 9ed2ce2a-ad26-448d-ae23-a6b4a9d06faa, chat.message positions 3, 5, 7).
 */
export const DECISION_INDENTED_WITH_ID = `<decision prompt="Pick our first launch channel">
  <option id="email-waitlist" label="Email List / Waitlist">
    Reach out directly to people who have already shown interest; this offers the highest initial conversion rate and the fastest qualitative feedback.
  </option>
  <option id="niche-communities" label="Niche Communities & Early Adopter Platforms">
    Launch in targeted spaces like specialized subreddits, Discord/Slack groups, or Product Hunt to tap into an audience actively looking for new tools.
  </option>
  <option id="founder-social" label="Organic Social / Founder-Led Outreach">
    Share the launch story and problem-solving process on platforms like LinkedIn or X to generate organic traction and build trust in public.
  </option>
</decision>`;

export const DECISION_LINE_START_WITH_ID = `<decision prompt="Pick a pricing model">
<option id="subscription" label="Subscription (Monthly / Annual)">
Predictable recurring revenue with straightforward tiers that provide continuous cash flow and lower upfront barrier to entry.
</option>
<option id="freemium" label="Freemium with Premium Tiers">
A free base offering that drives rapid user acquisition and organic word-of-mouth, converting power users via gated advanced features.
</option>
<option id="one-time" label="One-Time Early-Bird Access">
A discounted lifetime or fixed upfront payment that generates launch urgency, rewards early adopters, and provides immediate revenue.
</option>
</decision>`;

export const QUESTIONNAIRE_XML = `<questionnaire title="Product Launch Strategy & Readiness">
  <question id="target_audience" type="text" prompt="Who is your specific target customer or ideal user for this launch?" />

  <question id="primary_goal" type="choice" prompt="What is your single most important success metric for the launch?">
    <option value="validation">Qualitative feedback & product-market fit signals</option>
    <option value="signups">User acquisition / volume of active accounts</option>
    <option value="revenue">Direct revenue / paid customer conversion</option>
    <option value="partnerships">Strategic partnerships & industry visibility</option>
  </question>

  <question id="current_reach" type="choice" prompt="What existing audience or distribution channel do you currently have in place?">
    <option value="none">None (launching cold / starting from zero)</option>
    <option value="waitlist">Dedicated waitlist or email list (1–500 subscribers)</option>
    <option value="social_network">Active personal or company network / following (500+ followers)</option>
    <option value="established">Substantial existing community or customer base (1,000+ contacts)</option>
  </question>

  <question id="launch_timeline" type="choice" prompt="What is your planned timeline to launch?">
    <option value="immediate">Within the next 7 days</option>
    <option value="short_term">2 to 4 weeks</option>
    <option value="medium_term">1 to 2 months</option>
  </question>

  <question id="value_proposition" type="text" prompt="In one sentence, what specific problem does your product solve that alternatives do not?" />
</questionnaire>`;
