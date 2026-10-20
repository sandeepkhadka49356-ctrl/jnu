import { PrismaClient } from '@prisma/client'

import type { Block } from '../src/lib/content-types'

/**
 * Seeds the prose below the programme table on each faculty page.
 *
 *     npx tsx prisma/seed-faculty-content.ts
 *
 * ONLY writes a faculty whose body is still empty. Run it twice and the second
 * run changes nothing; edit a faculty in the admin panel afterwards and this
 * script will never overwrite that work. Content is owned by the office once
 * they have touched it.
 *
 * Why this exists: faculty pages carried a one-line summary and a table, about
 * 175 words of real content, and were being outranked for their own courses by
 * directory sites carrying two thousand. The tables were already right; what
 * was missing was everything a candidate needs in order to decide whether to
 * apply.
 *
 * Every figure the university would be accountable for — placement
 * percentages, laboratory counts, approval status, minimum marks — is a
 * MAINTAINER note rather than an invented number. Those render nowhere on the
 * public site (Blocks.tsx drops them unless NEXT_PUBLIC_SHOW_MAINTAINER_NOTES
 * is on) but stay visible in Admin → Faculties, so the outstanding questions
 * travel with the page instead of living in a document nobody opens again.
 */

const p = (text: string): Block => ({ type: 'p', text })
const h2 = (text: string): Block => ({ type: 'h2', text })
const h3 = (text: string): Block => ({ type: 'h3', text })
/** Staff-only. Never rendered publicly. */
const todo = (text: string): Block => ({ type: 'note', text, audience: 'maintainer' })

export const CONTENT: Record<string, Block[]> = {
  'engineering-technology': [
    h2('About the faculty'),
    p(
      'Each branch is taught by its own department, with departmental laboratories and workshops supporting the practical component of every year, and a central computing facility shared across the faculty. Students admitted to the first year study a common foundation in engineering mathematics, physics and basic engineering before specialising.'
    ),

    h2('Eligibility in detail'),
    p(
      'Admission to any B.Tech programme requires a pass in 10+2 with Physics, Chemistry and Mathematics from a recognised board. Candidates awaiting their 10+2 result may apply, with admission confirmed on production of the mark sheet.'
    ),
    p('Admission to M.Tech requires a B.Tech or an equivalent degree in a relevant discipline.'),
    todo(
      'CONFIRM: minimum percentage at 10+2 for B.Tech, whether it differs for reserved categories, minimum marks at degree level for M.Tech, and whether GATE is accepted or required.'
    ),

    h2('Facilities'),
    p(
      'Teaching is supported by departmental laboratories and workshops, and by a central computing facility available to students across all four branches.'
    ),
    todo(
      'CONFIRM: list the main laboratories per branch — for example a surveying lab and concrete lab for Civil, a machine shop and thermal lab for Mechanical, a machines lab for Electrical, and the programming and networking labs for CSE. Also library holdings for engineering if the figure is known.'
    ),

    h2('After the degree'),
    p(
      'Graduates of the four-year programmes enter roles in software development, construction and site supervision, manufacturing, and power distribution, according to their branch. The M.Tech is taken by those moving into specialist technical roles, research, or teaching at degree level. Students also use the degree to qualify for GATE, for public sector engineering recruitment, and for postgraduate study in India and abroad.'
    ),
    todo(
      'CONFIRM: companies that have recruited from this faculty, and any placement percentage the university can evidence. If no verified figure exists, add nothing rather than estimating.'
    ),

    h2('Frequently asked questions'),
    h3('What is the eligibility for B.Tech admission at Jodhpur National University?'),
    p(
      'A pass in 10+2 with Physics, Chemistry and Mathematics from a recognised board. Applications can be submitted through the online admission form on this website.'
    ),
    h3('How long is the B.Tech programme?'),
    p('Four years, taught across eight semesters.'),
    h3('Which engineering branches are available?'),
    p(
      'Computer Science & Engineering, Civil Engineering, Mechanical Engineering and Electrical Engineering at undergraduate level, and Computer Science & Engineering at M.Tech level.'
    ),
    h3('What are the fees for B.Tech?'),
    p('Current fees for every programme are listed on the Fee Structure page.'),

    h2('How to apply'),
    p(
      'Applications for B.Tech and M.Tech are made through the online admission form on this website. A candidate applies to the faculty and selects a branch; admission is confirmed on verification of original 10+2 or degree certificates and mark sheets. Teaching follows a semester pattern, with semester examinations and continuous internal assessment through the year.'
    ),
  ],

  pharmacy: [
    h2('About the faculty'),
    p(
      'The programmes cover pharmaceutics, pharmaceutical chemistry, pharmacology and pharmacognosy, with laboratory work forming a substantial part of assessment in every year. Pharmacy is a regulated profession in India, and the structure of the degree follows the requirements set by the statutory council governing pharmacy education.'
    ),
    todo(
      'CONFIRM BEFORE PUBLISHING: current Pharmacy Council of India approval status and its validity. This is the single thing prospective students check most. State it plainly if it can be evidenced; if the position is uncertain, say nothing.'
    ),

    h2('Eligibility in detail'),
    p(
      'B.Pharm admission requires 10+2 with Physics and Chemistry, together with either Biology or Mathematics. M.Pharm admission requires a B.Pharm from a recognised institution.'
    ),
    todo(
      'CONFIRM: minimum percentage at 10+2, and the specialisations offered at M.Pharm level — for example Pharmaceutics, Pharmacology, Pharmaceutical Chemistry.'
    ),

    h2('Facilities'),
    todo(
      'CONFIRM: pharmacy laboratories available — typically separate laboratories for pharmaceutics, pharmaceutical chemistry, pharmacology and pharmacognosy, plus a machine room and an animal house if present. List only what exists. Also note any herbarium, museum or instrumentation worth naming.'
    ),

    h2('After the degree'),
    p(
      'Pharmacy graduates work in hospital and community pharmacy, in quality control and production within the pharmaceutical industry, in regulatory affairs, and in medical representation. The M.Pharm leads to formulation and analytical roles, research positions, and teaching. Graduates are also eligible to register as pharmacists with the state pharmacy council, subject to the council’s own requirements.'
    ),

    h2('Frequently asked questions'),
    h3('What is the eligibility for B.Pharm?'),
    p('10+2 with Physics and Chemistry, and either Biology or Mathematics, from a recognised board.'),
    h3('Is Biology compulsory for B.Pharm admission?'),
    p(
      'No. Candidates with Mathematics in place of Biology are also eligible, provided they have studied Physics and Chemistry.'
    ),
    h3('How long is the B.Pharm programme?'),
    p('Four years.'),
    todo(
      'ADD WHEN CONFIRMED: an FAQ answering "Can I register as a pharmacist after this degree?" — answer only once the council approval position is certain.'
    ),

    h2('How to apply'),
    p(
      'Applications for B.Pharm and M.Pharm are made through the online admission form on this website. Admission is confirmed on verification of original 10+2 or B.Pharm certificates and mark sheets. Assessment combines semester examinations with continuous internal assessment, and practical examinations carry significant weight in every year of both programmes.'
    ),
  ],

  'computer-application': [
    h2('About the faculty'),
    p(
      'Both programmes are practical and software-oriented, covering programming, data structures, database systems, web and application development, and software engineering. The BCA suits students who want a computing degree without the Physics and Chemistry requirement of an engineering course, since it admits candidates from any 10+2 stream provided they have studied Mathematics.'
    ),

    h2('Eligibility in detail'),
    p(
      'BCA admission is open to candidates from any 10+2 stream — science, commerce or arts — provided Mathematics was studied. MCA admission requires a bachelor’s degree in any discipline, with Mathematics studied either at 10+2 or at degree level.'
    ),
    todo('CONFIRM: minimum percentage for both programmes.'),

    h2('Facilities'),
    p(
      'Students have access to the university’s computing facilities for practical work throughout the programme.'
    ),
    todo(
      'CONFIRM: number of computer laboratories, approximate number of systems, internet provision, and any software or platforms students are given access to.'
    ),

    h2('After the degree'),
    p(
      'BCA graduates enter junior software development, web development, testing, and IT support roles, and many continue to an MCA or an M.Sc in computing. MCA graduates take up software engineering, database administration, systems analysis and application development posts. Both degrees are also a route into government IT recruitment, which commonly lists BCA and MCA among its qualifying degrees.'
    ),
    todo('CONFIRM: placement information for this faculty, if verified figures exist.'),

    h2('Frequently asked questions'),
    h3('Can I take BCA if I studied commerce or arts at 10+2?'),
    p('Yes, provided you studied Mathematics. The BCA is open to candidates from any stream on that condition.'),
    h3('What is the difference between BCA and B.Tech Computer Science?'),
    p(
      'The BCA is a three-year degree focused on software and applications, and admits students from any 10+2 stream with Mathematics. The B.Tech is a four-year engineering degree that requires Physics, Chemistry and Mathematics at 10+2 and includes a broader engineering foundation.'
    ),
    h3('Is a Mathematics background required for MCA?'),
    p('Yes — Mathematics must have been studied either at 10+2 or at degree level.'),
    h3('How long is the MCA?'),
    p('Two years.'),

    h2('How to apply'),
    p(
      'Applications for BCA and MCA are made through the online admission form on this website. Candidates should have their 10+2 mark sheet available, since the Mathematics requirement is checked at admission. Teaching follows a semester pattern, with semester examinations, continuous internal assessment, and practical work assessed alongside theory papers.'
    ),
  ],

  'commerce-management': [
    h2('About the faculty'),
    p(
      'The undergraduate programmes cover accounting, business law, economics, and the functional areas of management; the MBA builds on a first degree with specialised study in management disciplines. All three admit students from any 10+2 or degree stream, which makes this the most broadly accessible faculty in the university for candidates who did not take science subjects.'
    ),

    h2('Eligibility in detail'),
    p(
      'BBA admission is open to candidates from any 10+2 stream. B.Com admission is also open to any stream, though candidates who studied commerce subjects are better prepared for the accounting component. MBA admission requires a bachelor’s degree in any discipline.'
    ),
    todo(
      'CONFIRM: minimum percentage for each programme; whether any entrance test (CAT, MAT, CMAT or a university test) is accepted or required for MBA admission; and the MBA specialisations offered — for example Marketing, Finance, Human Resources.'
    ),

    h2('Facilities'),
    todo(
      'CONFIRM: facilities for this faculty — seminar rooms, a computer laboratory for business software, library holdings in commerce and management, and any industry interaction such as guest lectures or industrial visits.'
    ),

    h2('After the degree'),
    p(
      'BBA and B.Com graduates enter accounting, banking, insurance, retail management and administrative roles, and many go on to an MBA or to professional qualifications in accountancy and company secretaryship. MBA graduates take positions in marketing, finance, human resources and operations across private sector organisations.'
    ),
    todo('CONFIRM: recruiters and placement figures, only if evidenced.'),

    h2('Frequently asked questions'),
    h3('Can I do BBA after a science or arts stream at 10+2?'),
    p('Yes. The BBA admits candidates from any 10+2 stream.'),
    h3('What is the difference between BBA and B.Com?'),
    p(
      'The BBA concentrates on management and business administration; the B.Com concentrates on accounting, commerce and finance. Both are three-year degrees.'
    ),
    h3('How long is the MBA?'),
    p('Two years, taught across four semesters.'),
    todo(
      'ADD WHEN CONFIRMED: an FAQ answering "Is an entrance exam required for the MBA?" — prospective students plan around this, so answer it once the admission policy is settled.'
    ),

    h2('How to apply'),
    p(
      'Applications for BBA, B.Com and MBA are made through the online admission form on this website. Admission is confirmed on verification of original 10+2 or degree certificates and mark sheets. All three programmes follow a semester pattern, combining semester examinations with continuous internal assessment through the year.'
    ),
  ],

  'arts-social-science': [
    h2('About the faculty'),
    p(
      'Students choose a combination of subjects at undergraduate level and specialise in a single subject at postgraduate level.'
    ),
    todo(
      'MOST IMPORTANT GAP ON THIS PAGE — CONFIRM: the subjects offered at B.A and M.A level, for example Hindi, English, History, Political Science, Economics, Sociology, Geography. Students search for the subject, not for "B.A", so this page cannot rank for anything until the subjects are listed.'
    ),

    h2('Eligibility in detail'),
    p(
      'B.A admission is open to candidates who have passed 10+2 in any stream. M.A admission requires a bachelor’s degree in a relevant subject — a candidate applying for M.A History would normally be expected to have studied History at degree level.'
    ),
    todo(
      'CONFIRM: minimum percentage, and whether candidates holding a degree in an unrelated subject may apply for M.A.'
    ),

    h2('Facilities'),
    todo(
      'CONFIRM: library holdings in arts and social science, any language laboratory, seminar provision, and departmental resources worth naming.'
    ),

    h2('After the degree'),
    p(
      'Graduates enter teaching, administration, journalism, social work and the public sector. The B.A is also the usual route to B.Ed for those entering school teaching, and to competitive examinations for state and central government service, where a graduate degree in any discipline is the common requirement. The M.A leads to teaching at higher levels, to research, and to UGC-NET for those aiming at college lectureship.'
    ),

    h2('Frequently asked questions'),
    h3('How long is the B.A programme?'),
    p('Three years.'),
    h3('Can I do B.Ed after B.A?'),
    p(
      'Yes. A bachelor’s degree is the entry requirement for the two-year B.Ed, which this university also offers.'
    ),
    todo(
      'ADD WHEN CONFIRMED: FAQs answering "Which subjects can I take for B.A?" and "Can I do M.A in a subject I did not study at degree level?"'
    ),

    h2('How to apply'),
    p(
      'Applications for B.A and M.A are made through the online admission form on this website. Candidates applying for M.A should be ready to show the degree mark sheet for the subject they wish to continue. Teaching follows a semester pattern, with semester examinations and continuous internal assessment.'
    ),
  ],

  science: [
    h2('About the faculty'),
    p(
      'Laboratory work runs through every year of both programmes, and students are assessed on practical examinations alongside theory papers.'
    ),
    todo(
      'MOST IMPORTANT GAP ON THIS PAGE — CONFIRM: the subjects offered at B.Sc and M.Sc level, for example Physics, Chemistry, Botany, Zoology, Mathematics. As with Arts, students search for the subject rather than for "B.Sc", so this matters more than any other sentence on the page.'
    ),

    h2('Eligibility in detail'),
    p(
      'B.Sc admission requires a pass in 10+2 in the science stream. M.Sc admission requires a B.Sc with the relevant subject studied at degree level.'
    ),
    todo(
      'CONFIRM: minimum percentage for each, and the subject combinations accepted at 10+2 for each B.Sc stream.'
    ),

    h2('Facilities'),
    p('Departmental laboratories support the practical component of each subject.'),
    todo(
      'CONFIRM: which laboratories exist and what instrumentation is available. This is the detail that distinguishes a science faculty, and parents look for it specifically.'
    ),

    h2('After the degree'),
    p(
      'B.Sc graduates enter laboratory and technical roles, and commonly continue to an M.Sc, a B.Ed for school teaching, or professional study. The M.Sc leads to research positions, analyst and quality roles in industry, and teaching; it is also the qualifying degree for UGC-NET and for doctoral study.'
    ),

    h2('Frequently asked questions'),
    h3('What is the eligibility for M.Sc?'),
    p('A B.Sc with the relevant subject studied at degree level.'),
    h3('How long is the B.Sc programme?'),
    p('Three years.'),
    h3('Are practical examinations part of the assessment?'),
    p('Yes. Practical work is assessed alongside theory papers in each year.'),
    todo('ADD WHEN CONFIRMED: an FAQ listing the subjects offered for B.Sc.'),

    h2('How to apply'),
    p(
      'Applications for B.Sc and M.Sc are made through the online admission form on this website. Admission is confirmed on verification of original 10+2 or degree certificates and mark sheets. Teaching follows a semester pattern, and practical examinations are assessed alongside theory papers in each year of both programmes.'
    ),
  ],

  education: [
    h2('About the faculty'),
    p(
      'The B.Ed prepares graduates for school teaching and combines theory with school-based teaching practice; the M.Ed is for practising teachers and B.Ed holders moving into senior school roles, teacher training or educational research. Teacher education in India is a regulated field, and the duration and structure of the B.Ed follow the requirements set by the national regulatory council.'
    ),
    todo(
      'CONFIRM BEFORE PUBLISHING: current NCTE recognition status and sanctioned intake for B.Ed and M.Ed. Candidates and employers check this specifically, and a B.Ed without recognition is not accepted for school appointments. State it only if it can be evidenced.'
    ),

    h2('Eligibility in detail'),
    p(
      'B.Ed admission requires a bachelor’s degree with the required minimum marks. M.Ed admission requires a B.Ed from a recognised institution.'
    ),
    todo(
      'CONFIRM: the exact minimum percentage for B.Ed, whether it differs for reserved categories, whether admission is through a state-level entrance test, and the minimum marks required at B.Ed level for M.Ed.'
    ),

    h2('Teaching practice and facilities'),
    p('The B.Ed includes school-based teaching practice as a required component.'),
    todo(
      'CONFIRM: how teaching practice is arranged — which schools students are placed in and for how many weeks. Also facilities: psychology laboratory, educational technology room, library holdings in education, any resource room.'
    ),

    h2('After the degree'),
    p(
      'The B.Ed is the standard qualification for school teaching in India, and holders are eligible to appear for teacher eligibility tests at state and central level. The M.Ed leads to senior school positions, to teaching in teacher-training institutions, and to educational administration and research.'
    ),

    h2('Frequently asked questions'),
    h3('How long is the B.Ed programme?'),
    p('Two years.'),
    h3('Can I do M.Ed immediately after B.Ed?'),
    p('Yes, provided the B.Ed is from a recognised institution.'),
    todo(
      'ADD WHEN CONFIRMED: FAQs stating the minimum percentage for B.Ed, and answering "Can I appear for teacher eligibility tests after this B.Ed?" — both depend on the recognition position.'
    ),

    h2('How to apply'),
    p(
      'Applications for B.Ed and M.Ed are made through the online admission form on this website. Candidates should have their degree certificate and mark sheets available, since the minimum marks requirement is checked at admission. Both programmes follow a semester pattern, and the B.Ed additionally requires satisfactory completion of school-based teaching practice.'
    ),
  ],

  law: [
    h2('About the faculty'),
    p(
      'The LL.B is the graduate-entry route to legal practice, covering constitutional law, contract, criminal law, property, procedure and professional ethics, with moot court exercises forming part of the training. Legal education in India is regulated, and eligibility to practise depends on the recognition of the degree by the Bar Council.'
    ),
    todo(
      'CONFIRM BEFORE PUBLISHING: current Bar Council of India approval status for the LL.B. No question matters more to a prospective law student. State it plainly if it can be evidenced; if uncertain, say nothing.'
    ),

    h2('Eligibility in detail'),
    p(
      'LL.B admission requires a bachelor’s degree in any discipline. LL.M admission requires an LL.B or an equivalent qualification.'
    ),
    todo(
      'CONFIRM: minimum percentage for both, whether any entrance test applies, and the LL.M specialisations offered — for example Constitutional Law, Criminal Law, Business Law.'
    ),

    h2('Facilities'),
    p('The faculty maintains moot court facilities and a dedicated law library.'),
    todo(
      'CONFIRM: law library holdings — number of titles, law reports and journals subscribed. For a law faculty this is a meaningful indicator. Also whether a legal aid clinic or internship arrangement operates, and with which courts or firms students intern.'
    ),

    h2('After the degree'),
    p(
      'LL.B graduates enter practice at the bar, join law firms, work as legal advisers in companies and banks, and appear for judicial service examinations. Enrolment as an advocate requires registration with a State Bar Council and passing the All India Bar Examination. The LL.M leads to specialist practice, to teaching, and to research.'
    ),

    h2('Frequently asked questions'),
    h3('What is the eligibility for LL.B?'),
    p('A bachelor’s degree in any discipline. The three-year LL.B is a graduate-entry programme.'),
    h3('How long is the LL.B?'),
    p('Three years, for candidates who already hold a bachelor’s degree.'),
    h3('Is there a moot court?'),
    p('Yes. Moot court exercises form part of the training.'),
    todo(
      'ADD WHEN CONFIRMED: an FAQ answering "Can I practise as an advocate after this LL.B?" — this depends on Bar Council recognition and must not be answered until that is certain.'
    ),

    h2('How to apply'),
    p(
      'Applications for LL.B and LL.M are made through the online admission form on this website. The three-year LL.B is a graduate-entry programme, so a degree certificate and mark sheets are required at admission. Teaching follows a semester pattern, with semester examinations, continuous internal assessment, and moot court participation forming part of the training.'
    ),
  ],
}

export async function main() {
  const db = new PrismaClient()
  let written = 0
  let skipped = 0
  let missing = 0

  try {
    for (const [slug, blocks] of Object.entries(CONTENT)) {
      const faculty = await db.faculty.findUnique({ where: { slug }, select: { id: true, body: true } })

      if (!faculty) {
        console.log(`  –  ${slug}: no such faculty, skipped`)
        missing++
        continue
      }

      // Anything other than an empty array means someone has edited this
      // faculty. Their work wins.
      const existing = (() => {
        try {
          return JSON.parse(faculty.body)
        } catch {
          return []
        }
      })()

      if (Array.isArray(existing) && existing.length > 0) {
        console.log(`  –  ${slug}: already has content, left alone`)
        skipped++
        continue
      }

      await db.faculty.update({ where: { id: faculty.id }, data: { body: JSON.stringify(blocks) } })
      const notes = blocks.filter((b) => b.type === 'note').length
      console.log(`  ✓  ${slug}: ${blocks.length} blocks (${notes} staff notes)`)
      written++
    }

    console.log(`\n${written} written, ${skipped} left alone, ${missing} not found.`)
    if (written > 0) {
      console.log('Restart the app so the pages rebuild: sudo systemctl restart jnu')
    }
  } finally {
    await db.$disconnect()
  }
}

if (process.argv[1] && process.argv[1].includes("seed-faculty-content")) main().catch((e) => {
  console.error(e)
  process.exit(1)
})
