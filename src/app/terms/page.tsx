"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/client";

const LAST_UPDATED = "2026-04-28";
const VERSION = "1.0";

function TermsEn() {
  return (
    <>
      <section>
        <h2 className="mb-3 text-xl font-semibold">1. Introduction</h2>
        <p>
          These Terms of Use (&ldquo;Terms&rdquo;) govern your access to and use
          of the Reelio service (&ldquo;Service&rdquo;), operated by Reelio
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). By creating
          an account or otherwise using the Service, you agree to be bound by
          these Terms.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">2. Eligibility</h2>
        <p>
          The Service is intended for users aged 18 and above. If you are under
          18, you may not use the Service. By using the Service you represent
          that you meet this age requirement and have the legal capacity to
          enter into these Terms.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">3. Account registration</h2>
        <p>
          You must provide accurate information when creating an account and
          keep it up to date. You are responsible for maintaining the
          confidentiality of your credentials and for all activity that occurs
          under your account. Notify us immediately of any unauthorized use.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 ps-6">
          <li>Upload content that infringes any third party&rsquo;s intellectual property, privacy or other rights.</li>
          <li>Upload images of properties or people without the necessary rights or consents.</li>
          <li>Impersonate any person or misrepresent your affiliation with any person or entity.</li>
          <li>Use the Service to generate unlawful, defamatory, harassing, hateful, sexually explicit, deceptive or misleading content.</li>
          <li>Attempt to scrape, reverse-engineer, probe or disrupt the Service.</li>
          <li>Use the Service in violation of applicable laws or regulations.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">5. User content and AI-generated outputs</h2>
        <p>
          You retain ownership of the photos and other content you upload
          (&ldquo;User Content&rdquo;). You grant us a limited, worldwide,
          royalty-free license to host, process and transform User Content
          solely for the purpose of operating the Service and producing the
          outputs you request.
        </p>
        <p className="mt-3">
          As between you and us, you own the AI-generated images, videos,
          voiceovers and other outputs produced for you (&ldquo;Outputs&rdquo;),
          subject to these Terms and to any restrictions imposed by the
          underlying model providers. You are responsible for verifying that
          your use of Outputs complies with applicable law and third-party
          rights.
        </p>
        <p className="mt-3">
          We may use anonymized and aggregated data, logs and metrics to
          monitor, secure and improve the Service.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">6. Third-party services</h2>
        <p>
          The Service relies on third-party AI providers (including kie.ai,
          ElevenLabs, Anthropic and Google Cloud Vision) and infrastructure
          providers (including Supabase, Cloudflare R2, Trigger.dev and
          Vercel). Outputs generated through these providers may be subject to
          their respective terms and acceptable-use policies, which apply to
          you in addition to these Terms.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">7. Fees and credits</h2>
        <p>
          Some features of the Service require credits or paid plans. Pricing,
          billing terms and refund policies for paid plans will be presented
          before you purchase and will be governed by separate billing terms
          incorporated by reference into these Terms.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">8. Intellectual property</h2>
        <p>
          The Service, including its software, design, branding and underlying
          technology, is owned by us and our licensors and is protected by
          intellectual property laws. We grant you a limited, non-exclusive,
          non-transferable, revocable license to use the Service in accordance
          with these Terms.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">9. Disclaimers</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; without warranties of any kind, whether express or
          implied. AI-generated outputs may contain errors, inaccuracies or
          unexpected results. You are solely responsible for reviewing Outputs
          before relying on or distributing them.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">10. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, we will not be liable for any
          indirect, incidental, special, consequential or punitive damages, or
          for any loss of profits, revenues, data or goodwill, arising out of
          or related to your use of the Service.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">11. Termination</h2>
        <p>
          You may stop using the Service and request deletion of your account at
          any time. We may suspend or terminate your access if you violate these
          Terms or applicable law, or if continued provision of the Service is
          not commercially or legally feasible.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">12. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. The &ldquo;Last
          updated&rdquo; date at the top of this page reflects the latest
          revision. Continued use of the Service after changes take effect
          constitutes acceptance of the updated Terms.
        </p>
      </section>

      <section className="mt-10 border-t border-[var(--line-soft)] pt-6">
        <h2 className="mb-3 text-xl font-semibold">13. Legal provisions</h2>
        <h3 className="mt-2 mb-1 font-semibold">Entire agreement</h3>
        <p>
          These Terms constitute the entire agreement between you and us
          regarding the Service and supersede all prior agreements,
          understandings or representations, written or oral.
        </p>
        <h3 className="mt-4 mb-1 font-semibold">Severability</h3>
        <p>
          If any provision of these Terms is determined to be invalid or
          unenforceable, the remaining provisions shall remain in full force
          and effect.
        </p>
        <h3 className="mt-4 mb-1 font-semibold">Governing law and jurisdiction</h3>
        <p>
          These Terms are governed by the laws of the State of Israel.
          Exclusive jurisdiction shall be with the competent courts of Tel
          Aviv-Jaffa.
        </p>
      </section>
    </>
  );
}

function TermsHe() {
  return (
    <>
      <p className="mb-6 text-sm text-[var(--color-muted)]">
        האמור במסמך זה בלשון זכר מתייחס לנשים וגברים כאחד, והשימוש בלשון זכר נעשה
        מטעמי נוחות בלבד.
      </p>

      <section>
        <h2 className="mb-3 text-xl font-semibold">1. מבוא</h2>
        <p>
          תנאי שימוש אלה (&ldquo;התנאים&rdquo;) חלים על הגישה והשימוש שלך
          בשירות Reelio (&ldquo;השירות&rdquo;), המופעל על ידי Reelio
          (&ldquo;אנו&rdquo;, &ldquo;אנחנו&rdquo;, &ldquo;שלנו&rdquo;). יצירת
          חשבון או שימוש אחר בשירות מהווים את הסכמתך להתחייב לתנאים אלה.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">2. זכאות</h2>
        <p>
          השירות מיועד למשתמשים מגיל 18 ומעלה. אם גילך מתחת ל-18, אינך רשאי/ת
          להשתמש בשירות. בעצם השימוש בשירות אתה מצהיר/ה כי אתה עומד/ת בדרישת
          הגיל וכי יש לך כשרות משפטית להתקשר בתנאים אלה.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">3. רישום חשבון</h2>
        <p>
          עליך למסור מידע מדויק בעת יצירת חשבון ולשמור אותו מעודכן. אתה אחראי/ת
          לשמירה על סודיות פרטי הכניסה ולכל פעילות המתבצעת בחשבונך. יש להודיע
          לנו מיד על כל שימוש בלתי מורשה.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">4. שימוש מותר</h2>
        <p>אתה מתחייב/ת שלא:</p>
        <ul className="list-disc space-y-1 ps-6">
          <li>להעלות תכנים המפרים זכויות קניין רוחני, פרטיות או זכויות אחרות של צד שלישי.</li>
          <li>להעלות תמונות של נכסים או של אנשים מבלי שיש לך את הזכויות וההסכמות הנדרשות.</li>
          <li>להתחזות לאדם אחר או להציג מצג שווא לגבי השתייכותך לאדם או גוף כלשהו.</li>
          <li>להשתמש בשירות ליצירת תוכן בלתי חוקי, מוציא לשון הרע, מטריד, פוגעני, מיני בעליל, מטעה או מחזיק במצגי שווא.</li>
          <li>לנסות לבצע scraping, הנדסה הפוכה, חקירה אוטומטית או שיבוש של השירות.</li>
          <li>להשתמש בשירות בניגוד לחוק או לרגולציה החלים.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">5. תכני משתמש ותוצרי AI</h2>
        <p>
          הבעלות על התמונות והתכנים שאתה מעלה (&ldquo;תכני משתמש&rdquo;)
          נשארת שלך. אתה מעניק/ה לנו רישיון מוגבל, עולמי, ללא תמלוגים, לאחסן,
          לעבד ולהמיר את תכני המשתמש אך ורק לצורך הפעלת השירות והפקת התוצרים
          שביקשת.
        </p>
        <p className="mt-3">
          ביחסים בינינו, התמונות, הסרטונים, הקריינויות והתוצרים האחרים שמופקים
          עבורך (&ldquo;התוצרים&rdquo;) שייכים לך, בכפוף לתנאים אלה ולהגבלות
          שמטילים ספקי המודלים. באחריותך לוודא ששימושך בתוצרים תואם את החוק
          החל ואת זכויותיהם של צדדים שלישיים.
        </p>
        <p className="mt-3">
          אנו רשאים להשתמש בנתונים מצרפיים ואנונימיים, יומני שימוש ומדדים, כדי
          לפקח, לאבטח ולשפר את השירות.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">6. שירותי צד שלישי</h2>
        <p>
          השירות נשען על ספקי AI חיצוניים (לרבות kie.ai, ElevenLabs, Anthropic
          ו-Google Cloud Vision) וספקי תשתית (לרבות Supabase, Cloudflare R2,
          Trigger.dev ו-Vercel). תוצרים שנוצרים באמצעות ספקים אלה עשויים להיות
          כפופים לתנאי השימוש ולמדיניות השימוש המקובל שלהם, החלים עליך
          בנוסף לתנאים אלה.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">7. תשלומים וקרדיטים</h2>
        <p>
          חלק מהיכולות בשירות מותנות בקרדיטים או במנוי בתשלום. תנאי המחיר,
          החיוב והחזרים יוצגו לפני הרכישה ויהיו כפופים לתנאי חיוב נפרדים שיהוו
          חלק בלתי נפרד מתנאים אלה.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">8. קניין רוחני</h2>
        <p>
          השירות, לרבות התוכנה, העיצוב, המיתוג והטכנולוגיה שבבסיסו, הם בבעלותנו
          ובבעלות מעניקי הרישיונות שלנו ומוגנים בדיני קניין רוחני. אנו מעניקים
          לך רישיון מוגבל, לא בלעדי, בלתי ניתן להעברה וניתן לביטול לשימוש
          בשירות בהתאם לתנאים אלה.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">9. הסתייגויות</h2>
        <p>
          השירות ניתן &ldquo;כפי שהוא&rdquo; (AS IS) ו&ldquo;ככל
          שזמין&rdquo; (AS AVAILABLE), ללא אחריות מכל סוג, מפורשת או משתמעת.
          תוצרים של AI עשויים לכלול שגיאות, אי-דיוקים או תוצאות בלתי צפויות.
          באחריותך הבלעדית לבדוק את התוצרים לפני הסתמכות עליהם או הפצתם.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">10. הגבלת אחריות</h2>
        <p>
          במידה המרבית המותרת על פי דין, לא נישא באחריות לכל נזק עקיף, מקרי,
          מיוחד, תוצאתי או עונשי, ולא לכל אובדן רווחים, הכנסות, מידע או מוניטין,
          הנובעים מהשימוש בשירות או הקשורים אליו.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">11. סיום</h2>
        <p>
          באפשרותך להפסיק את השימוש בשירות ולבקש את מחיקת חשבונך בכל עת. אנו
          רשאים להשעות או לסיים את גישתך אם הפרת את התנאים או את החוק החל, או
          אם המשך מתן השירות אינו מעשי מבחינה מסחרית או חוקית.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">12. שינויים בתנאים אלה</h2>
        <p>
          אנו עשויים לעדכן את התנאים מעת לעת. תאריך &ldquo;עודכן לאחרונה&rdquo;
          בראש העמוד משקף את העדכון האחרון. המשך השימוש בשירות לאחר כניסת
          השינויים לתוקף מהווה הסכמה לתנאים המעודכנים.
        </p>
      </section>

      <section className="mt-10 border-t border-[var(--line-soft)] pt-6">
        <h2 className="mb-3 text-xl font-semibold">13. הוראות משפטיות</h2>
        <h3 className="mt-2 mb-1 font-semibold">הסכם מלא</h3>
        <p>
          תנאים אלה מהווים את ההסכם המלא בינך לבינינו בנוגע לשירות, ומחליפים כל
          הסכם, הבנה או מצג קודמים, בכתב או בעל פה.
        </p>
        <h3 className="mt-4 mb-1 font-semibold">הפרדה</h3>
        <p>
          אם ייקבע כי הוראה כלשהי בתנאים אלה אינה תקפה או אינה ניתנת לאכיפה,
          יישארו שאר ההוראות בתוקפן המלא.
        </p>
        <h3 className="mt-4 mb-1 font-semibold">דין וסמכות שיפוט</h3>
        <p>
          תנאים אלה כפופים לחוקי מדינת ישראל. סמכות השיפוט הבלעדית תהיה לבתי
          המשפט המוסמכים בתל אביב-יפו.
        </p>
      </section>
    </>
  );
}

export default function TermsPage() {
  const { t, locale } = useI18n();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg-0)] px-4 py-8 text-[var(--fg-0)]">
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full min-w-0 max-w-4xl flex-col">
        <header className="flex min-w-0 items-center justify-between gap-4">
          <Link
            href="/"
            aria-label={t.common.appName}
            className="inline-flex min-w-0 items-center"
          >
            <Image
              src="/brand/reelio-logo-for-light.png"
              alt={t.common.appName}
              width={221}
              height={62}
              priority
              className="h-auto w-[148px] sm:w-[190px]"
            />
          </Link>
          <div className="shrink-0">
            <LanguageSwitcher />
          </div>
        </header>

        <motion.main
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 py-10 lg:py-14"
        >
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-semibold tracking-normal">
              {t.legal.termsTitle}
            </h1>
            <p className="text-sm text-[var(--color-muted)]">
              {t.legal.lastUpdated}: {LAST_UPDATED} &middot; {t.legal.version} {VERSION}
            </p>
          </div>

          <article className="space-y-8 text-base leading-relaxed text-[var(--fg-0)]">
            {locale === "he" ? <TermsHe /> : <TermsEn />}
          </article>

          <p className="mt-12 text-xs text-[var(--color-muted)]">
            {t.legal.notLegalAdvice}
          </p>

          <div className="mt-10 flex items-center justify-between gap-4">
            <Link
              href="/login"
              className="text-sm text-[var(--color-foreground)] underline underline-offset-2 transition-colors duration-150 hover:text-[var(--color-accent)]"
            >
              {t.auth.backToSignIn}
            </Link>
            <LanguageSwitcher />
          </div>
        </motion.main>
      </div>
    </div>
  );
}
