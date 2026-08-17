import { PrismaClient, Difficulty, NodeLevel } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const CONCEPT_LEVELS: NodeLevel[] = ['CONCEPT', 'TOPIC', 'DOMAIN', 'SUBJECT'];

// Find the deepest taxonomy node matching a name (prefers concept > topic > domain > subject)
async function findNode(name: string): Promise<number | null> {
  for (const level of CONCEPT_LEVELS) {
    const node = await prisma.taxonomyNode.findFirst({
      where: { nameEnglish: { equals: name, mode: 'insensitive' }, level },
      select: { id: true },
    });
    if (node) return node.id;
  }
  return null;
}

async function resolveConcept(names: string[]): Promise<number | null> {
  for (const name of names) {
    const id = await findNode(name);
    if (id !== null) return id;
  }
  return null;
}

async function main() {
  console.log('Seeding database...');

  // Admin user
  const adminPass = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@keralapsc.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@keralapsc.com',
      password: adminPass,
      role: 'ADMIN',
    },
  });

  // Demo student
  const studentPass = await bcrypt.hash('student123', 10);
  await prisma.user.upsert({
    where: { email: 'demo@student.com' },
    update: {},
    create: {
      name: 'Demo Student',
      email: 'demo@student.com',
      password: studentPass,
      role: 'STUDENT',
    },
  });

  // Exams
  const exams = [
    { name: 'LDC (Lower Division Clerk)', description: 'Lower Division Clerk Examination', category: 'Secretariat' },
    { name: 'LGS (Last Grade Servant)', description: 'Last Grade Servant Examination', category: 'General' },
    { name: 'PSC Degree Level', description: 'Degree Level Combined Examination', category: 'Degree Level' },
    { name: 'Police Constable', description: 'Kerala Police Constable Examination', category: 'Police' },
    { name: 'HSST (Higher Secondary School Teacher)', description: 'HSST Examination', category: 'Education' },
    { name: 'VEO (Village Extension Officer)', description: 'Village Extension Officer Examination', category: 'Revenue' },
  ];

  for (const examData of exams) {
    const exam = await prisma.exam.upsert({
      where: { name: examData.name },
      update: {},
      create: examData,
    });

    // Subjects for each exam
    const subjects = [
      { name: 'General Knowledge', order: 1 },
      { name: 'Current Affairs', order: 2 },
      { name: 'Mathematics', order: 3 },
      { name: 'English', order: 4 },
      { name: 'Malayalam', order: 5 },
      { name: 'General Science', order: 6 },
    ];

    for (const subjectData of subjects) {
      const subject = await prisma.subject.upsert({
        where: { name_examId: { name: subjectData.name, examId: exam.id } },
        update: {},
        create: { ...subjectData, examId: exam.id },
      });

      // Chapters per subject
      const chapterMap: Record<string, string[]> = {
        'General Knowledge': ['Kerala History', 'Indian History', 'Indian Constitution', 'Geography of Kerala', 'Indian Geography', 'Economy', 'Sports & Awards', 'Science & Technology'],
        'Current Affairs': ['Monthly Current Affairs', 'Kerala State News', 'National News', 'International News', 'Government Schemes', 'Important Appointments'],
        'Mathematics': ['Number System', 'Percentages', 'Profit & Loss', 'Time & Work', 'Time & Distance', 'Simple & Compound Interest', 'Mensuration', 'Algebra'],
        'English': ['Grammar Basics', 'Tenses', 'Articles & Prepositions', 'Comprehension', 'Vocabulary', 'Synonyms & Antonyms'],
        'Malayalam': ['Malayalam Grammar', 'Sahithyam', 'Vyakaranam', 'Padyam', 'Gadyam', 'Proverbs'],
        'General Science': ['Physics Basics', 'Chemistry Basics', 'Biology Basics', 'Human Body', 'Environment & Ecology', 'Computer Basics'],
      };

      const chapters = chapterMap[subjectData.name] || ['Chapter 1', 'Chapter 2'];
      for (let i = 0; i < chapters.length; i++) {
        await prisma.chapter.upsert({
          where: { name_subjectId: { name: chapters[i], subjectId: subject.id } },
          update: {},
          create: { name: chapters[i], subjectId: subject.id, order: i + 1 },
        });
      }
    }
  }

  // Sample questions — added to every exam's copy of the chapter so the
  // adaptive flow works no matter which exam a student selects.
  const questionSets: { chapterName: string; questions: any[] }[] = [
    {
      chapterName: 'Kerala History',
      questions: [
        {
          text: 'Who was the founder of the Travancore royal dynasty?',
          options: ['Marthanda Varma', 'Rama Varma', 'Uthradom Thirunal', 'Chithira Thirunal'],
          correctOption: 0,
          explanation: 'Marthanda Varma (1706-1758) is considered the maker of modern Travancore and founded the powerful Travancore state.',
          difficulty: Difficulty.EASY,
          tags: ['history', 'travancore', 'kerala'],
          conceptNames: ['Travancore Dynasty'],
        },
        {
          text: 'The Vaikkom Satyagraha of 1924 was led by whom?',
          options: ['T.K. Madhavan', 'Sree Narayana Guru', 'K. Kelappan', 'Mannath Padmanabhan'],
          correctOption: 0,
          explanation: 'T.K. Madhavan was the main organiser. The satyagraha was against untouchability and for temple entry rights.',
          difficulty: Difficulty.MEDIUM,
          tags: ['history', 'satyagraha', 'social reform'],
          conceptNames: ['Kerala Renaissance'],
        },
        {
          text: 'Kerala was formed as a state on which date?',
          options: ['November 1, 1956', 'August 15, 1947', 'January 26, 1950', 'October 2, 1956'],
          correctOption: 0,
          explanation: 'Kerala was formed on November 1, 1956 by the States Reorganisation Act based on linguistic lines.',
          difficulty: Difficulty.EASY,
          tags: ['history', 'kerala formation', 'states reorganisation'],
          conceptNames: ['Kerala History'],
        },
        {
          text: 'Analyze the impact of the Ezhava Memorial (1896) on the social reform movement in Kerala.',
          options: [
            'It demanded education and government jobs for Ezhavas, triggering organized reform',
            'It was only a religious petition with no political impact',
            'It led to immediate caste abolition',
            'It focused only on temple entry rights'
          ],
          correctOption: 0,
          explanation: 'The Ezhava Memorial of 1896 was a milestone petition demanding equal rights for the Ezhava community in education and employment, and it catalyzed organized social reform movements.',
          difficulty: Difficulty.HARD,
          tags: ['history', 'social reform', 'ezhava', 'analyze'],
          conceptNames: ['Malayali Memorial'],
        },
      ],
    },
    {
      chapterName: 'Indian Constitution',
      questions: [
        {
          text: 'Which article of the Indian Constitution abolishes untouchability?',
          options: ['Article 17', 'Article 14', 'Article 21', 'Article 25'],
          correctOption: 0,
          explanation: 'Article 17 abolishes untouchability and its practice in any form is an offence punishable by law.',
          difficulty: Difficulty.EASY,
          tags: ['constitution', 'fundamental rights'],
          conceptNames: ['Indian Constitution', 'Constitutional Framework'],
        },
        {
          text: 'Panchayati Raj was added to the Constitution by which amendment?',
          options: ['73rd Amendment', '42nd Amendment', '44th Amendment', '86th Amendment'],
          correctOption: 0,
          explanation: 'The 73rd Constitutional Amendment Act, 1992 gave constitutional status to Panchayati Raj institutions.',
          difficulty: Difficulty.MEDIUM,
          tags: ['constitution', 'panchayati raj', 'amendment'],
          conceptNames: ['Panchayati Raj'],
        },
        {
          text: 'The concept of "Basic Structure" of the Constitution was established in which case?',
          options: ['Kesavananda Bharati Case', 'Golaknath Case', 'Minerva Mills Case', 'Maneka Gandhi Case'],
          correctOption: 0,
          explanation: 'The Basic Structure doctrine was established by the Supreme Court in Kesavananda Bharati v. State of Kerala (1973).',
          difficulty: Difficulty.HARD,
          tags: ['constitution', 'judiciary', 'landmark cases'],
          conceptNames: ['Basic Structure Doctrine'],
        },
      ],
    },
    {
      chapterName: 'Number System',
      questions: [
        {
          text: 'What is the LCM of 12 and 18?',
          options: ['36', '24', '72', '6'],
          correctOption: 0,
          explanation: 'LCM of 12 and 18: 12 = 2²×3, 18 = 2×3². LCM = 2²×3² = 36.',
          difficulty: Difficulty.EASY,
          tags: ['maths', 'lcm', 'number system'],
          conceptNames: ['LCM'],
        },
        {
          text: 'A number when divided by 6 leaves remainder 3. What is the remainder when the square of that number is divided by 6?',
          options: ['3', '1', '2', '0'],
          correctOption: 0,
          explanation: 'If n = 6k+3, then n² = 36k²+36k+9 = 6(6k²+6k+1)+3. So remainder is 3.',
          difficulty: Difficulty.HARD,
          tags: ['maths', 'remainders', 'number system'],
          conceptNames: ['Remainder Theorem'],
        },
      ],
    },
    {
      chapterName: 'Monthly Current Affairs',
      questions: [
        {
          text: 'Which state launched the "Nava Kerala Mission" for social development?',
          options: ['Kerala', 'Tamil Nadu', 'Karnataka', 'Andhra Pradesh'],
          correctOption: 0,
          explanation: 'Kerala launched the Nava Kerala Mission (2017) comprising four campaigns: Haritha Keralam, Life Mission, Ardram, and Pothu Vidyabhyasa Samrakshana Yajnam.',
          difficulty: Difficulty.EASY,
          tags: ['current affairs', 'kerala schemes', 'government'],
          conceptNames: ['Social Welfare', 'Kerala Current Affairs'],
        },
      ],
    },
  ];

  for (const set of questionSets) {
    const chapters = await prisma.chapter.findMany({ where: { name: set.chapterName } });
    if (chapters.length === 0) continue;

    const resolved = [];
    for (const q of set.questions) {
      const { conceptNames, ...rest } = q;
      const conceptId = conceptNames ? await resolveConcept(conceptNames) : null;
      resolved.push({ ...rest, conceptId });
    }

    for (const chapter of chapters) {
      for (const r of resolved) {
        await prisma.question.create({ data: { ...r, chapterId: chapter.id } });
      }
    }
    console.log(`  ${set.chapterName}: ${resolved.length} questions × ${chapters.length} chapters`);
  }

  // Sample news items
  const newsItems = [
    {
      title: 'Kerala Budget 2024-25 Highlights',
      content: 'The Kerala Budget 2024-25 focuses on infrastructure development, education, and health sectors. Key allocations include ₹2000 crore for road development, ₹1500 crore for health sector, and ₹800 crore for digital literacy programs.',
      category: 'Kerala State News',
      source: 'Kerala Government',
    },
    {
      title: 'KPSC Notification: 500 LDC Posts',
      content: 'Kerala Public Service Commission has released notification for 500 Lower Division Clerk posts across various departments. Applications open. Exam tentatively scheduled for Q3 2024.',
      category: 'PSC Notifications',
      source: 'KPSC Official',
    },
    {
      title: 'New Education Policy Implementation in Kerala',
      content: 'Kerala moves ahead with NEP 2020 implementation. Focus on vocational education from Grade 6, mother tongue instruction, and holistic assessment system replacing rote learning.',
      category: 'Education',
      source: 'Education Department Kerala',
    },
    {
      title: 'Kerala Tourism Wins National Award',
      content: 'Kerala Tourism won the Best State Award for sustainable tourism practices at the National Tourism Awards 2024. The state was recognized for its responsible tourism initiatives.',
      category: 'Awards & Recognition',
      source: 'Ministry of Tourism',
    },
    {
      title: 'India Launches Mission Mausam',
      content: 'India launched "Mission Mausam" to modernize weather forecasting infrastructure. The mission aims to upgrade 2000 weather stations and improve rainfall prediction accuracy by 40%.',
      category: 'National News',
      source: 'Ministry of Earth Sciences',
    },
  ];

  for (const news of newsItems) {
    await prisma.newsItem.create({ data: news });
  }

  console.log('✅ Seeding complete!');
  console.log('Admin: admin@keralapsc.com / admin123');
  console.log('Student: demo@student.com / student123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
