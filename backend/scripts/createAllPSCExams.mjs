#!/usr/bin/env node
// Create all 40 new Kerala PSC exam types with full taxonomy trees
// Taxonomy hierarchy: EXAM (root id=1) → SUBJECT → DOMAIN → TOPIC → CONCEPT
// Each topic gets ~10 standard concept child nodes

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ROOT_ID = 1;

const CONCEPT_TEMPLATES = [
  (name) => `Introduction to ${name}`,
  (name) => `Basic Concepts of ${name}`,
  (name) => `Key Definitions in ${name}`,
  (name) => `Important Terms in ${name}`,
  (name) => `Fundamental Principles of ${name}`,
  (name) => `Core Concepts of ${name}`,
  (name) => `Essential Knowledge: ${name}`,
  (name) => `Key Facts: ${name}`,
  (name) => `Important Points: ${name}`,
  (name) => `Basic Understanding of ${name}`,
];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ─── ALL 40 EXAM DEFINITIONS ────────────────────────────────────────
const exams = [
  {
    name: 'Junior Supervisor',
    description: 'Kerala PSC Junior Supervisor Exam',
    category: 'PSC',
    subjects: {
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Geography': ['Physical Geography', 'Climate', ' Rivers', 'Soils'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
          'General Science': ['Physics Basics', 'Chemistry Basics', 'Biology Basics', 'Computer Basics'],
          'Economy': ['Indian Economy', 'Banking', 'Budget', 'Five Year Plans'],
          'Environment': ['Ecology', 'Biodiversity', 'Pollution', 'Climate Change'],
        },
      },
      'Commerce & Accountancy': {
        domains: {
          'Book Keeping': ['Single Entry', 'Double Entry', 'Journal Entries', 'Ledger'],
          'Financial Accounting': ['Trial Balance', 'Final Accounts', 'Depreciation', 'Inventory'],
          'Cost Accounting': ['Cost Sheet', 'Marginal Costing', 'Standard Costing', 'Budget Control'],
          'Business Commerce': ['Trade', 'Commerce Functions', 'Channels of Distribution', 'Warehousing'],
          'Business Laws': ['Indian Contract Act', 'Sale of Goods Act', 'Partnership Act', 'Negotiable Instruments'],
        },
      },
      'Quantitative Aptitude': {
        domains: {
          'Number System': ['HCF & LCM', 'Fractions', 'Decimals', 'Squares & Cubes'],
          'Percentage': ['Percentage Basics', 'Change in Percentage', 'Combined Percentage', 'Population'],
          'Profit & Loss': ['CP & SP', 'Discount', 'Marked Price', 'Dishonest Dealer'],
          'Simple & Compound Interest': ['SI Formula', 'CI Formula', 'CI vs SI', 'Installments'],
          'Time & Work': ['Efficiency', 'Pipes & Cisterns', 'Wages', 'Men-Women-Days'],
          'Time & Distance': ['Speed', 'Trains', 'Boats & Streams', 'Relative Speed'],
          'Data Interpretation': ['Tables', 'Bar Graphs', 'Pie Charts', 'Line Graphs'],
        },
      },
      'Reasoning': {
        domains: {
          'Verbal Reasoning': ['Analogy', 'Classification', 'Series', 'Odd One Out'],
          'Non-Verbal Reasoning': ['Pattern', 'Mirror Image', 'Water Image', 'Paper Folding'],
          'Logical Reasoning': ['Syllogism', 'Blood Relations', 'Direction Sense', 'Coding-Decoding'],
          'Puzzles': ['Seating Arrangement', 'Floor Puzzle', 'Box Puzzle', 'Scheduling'],
          'Data Sufficiency': ['Quantitative', 'Logical', 'Data Sufficiency mixed'],
        },
      },
      'English': {
        domains: {
          'Grammar': ['Tenses', 'Articles', 'Prepositions', 'Voice Change'],
          'Vocabulary': ['Synonyms', 'Antonyms', 'One Word Substitution', 'Idioms & Phrases'],
          'Comprehension': ['Passage Reading', 'Cloze Test', 'Sentence Rearrangement', 'Error Detection'],
          'Writing': ['Letter Writing', 'Essay Writing', 'Report Writing', 'Paragraph Writing'],
        },
      },
    },
  },
  {
    name: 'Assistant Manager',
    description: 'Kerala PSC Assistant Manager Exam',
    category: 'PSC',
    subjects: {
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Geography': ['Physical Geography', 'Climate', 'Rivers', 'Soils'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
          'General Science': ['Physics Basics', 'Chemistry Basics', 'Biology Basics', 'Computer Basics'],
        },
      },
      'HR Management': {
        domains: {
          'Recruitment': ['Selection Process', 'Interview', 'Testing', 'Onboarding'],
          'Training & Development': ['Training Methods', 'Performance Appraisal', 'Career Development', 'Mentoring'],
          'Compensation': ['Salary Structure', 'Benefits', 'Incentives', 'Pay Scale'],
          'Labour Laws': ['Industrial Disputes Act', 'Factories Act', 'Payment of Wages', 'Minimum Wages'],
          'Organisational Behaviour': ['Motivation', 'Leadership', 'Team Dynamics', 'Conflict Management'],
        },
      },
      'Financial Management': {
        domains: {
          'Financial Statements': ['Balance Sheet', 'Income Statement', 'Cash Flow', 'Ratio Analysis'],
          'Capital Budgeting': ['NPV', 'IRR', 'Payback Period', 'Risk Analysis'],
          'Working Capital': ['Cash Management', 'Inventory Management', 'Receivables', 'Payables'],
          'Cost Management': ['Cost Classification', 'Break-Even Analysis', 'Budgeting', 'Variance Analysis'],
        },
      },
      'Business Law': {
        domains: {
          'Indian Contract Act': ['Offer & Acceptance', 'Consideration', 'Breach', 'Remedies'],
          'Sale of Goods Act': ['Conditions & Warranties', 'Transfer of Property', 'Unpaid Seller', 'Bailment'],
          'Companies Act': ['Formation', 'Directors', 'Meetings', 'Winding Up'],
          'Partnership Act': ['Formation', 'Rights & Duties', 'Dissolution', 'Liability'],
        },
      },
      'Quantitative Aptitude': {
        domains: {
          'Number System': ['HCF & LCM', 'Fractions', 'Decimals', 'Squares & Cubes'],
          'Percentage': ['Percentage Basics', 'Change in Percentage', 'Combined Percentage', 'Population'],
          'Profit & Loss': ['CP & SP', 'Discount', 'Marked Price', 'Dishonest Dealer'],
          'Time & Work': ['Efficiency', 'Pipes & Cisterns', 'Wages', 'Men-Women-Days'],
          'Data Interpretation': ['Tables', 'Bar Graphs', 'Pie Charts', 'Line Graphs'],
        },
      },
      'English': {
        domains: {
          'Grammar': ['Tenses', 'Articles', 'Prepositions', 'Voice Change'],
          'Vocabulary': ['Synonyms', 'Antonyms', 'One Word Substitution', 'Idioms & Phrases'],
          'Comprehension': ['Passage Reading', 'Cloze Test', 'Sentence Rearrangement', 'Error Detection'],
        },
      },
    },
  },
  {
    name: 'LD Typist',
    description: 'Kerala PSC Lower Division Typist Exam',
    category: 'PSC',
    subjects: {
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Geography': ['Physical Geography', 'Climate', 'Rivers', 'Soils'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
          'General Science': ['Physics Basics', 'Chemistry Basics', 'Biology Basics', 'Computer Basics'],
        },
      },
      'Typing & Office Skills': {
        domains: {
          'Typing Fundamentals': ['Keyboard Layout', 'Home Row', 'Speed Building', 'Accuracy'],
          'MS Word': ['Document Formatting', 'Table Creation', 'Mail Merge', 'Macros'],
          'MS Excel': ['Formulas', 'Charts', 'Pivot Tables', 'Conditional Formatting'],
          'MS PowerPoint': ['Slide Design', 'Animations', 'Transitions', 'Presentation Skills'],
          'Office Procedures': ['Filing', 'Correspondence', 'Noting & Drafting', 'Record Management'],
        },
      },
      'English': {
        domains: {
          'Grammar': ['Tenses', 'Articles', 'Prepositions', 'Voice Change'],
          'Vocabulary': ['Synonyms', 'Antonyms', 'One Word Substitution', 'Idioms & Phrases'],
          'Comprehension': ['Passage Reading', 'Cloze Test', 'Error Detection', 'Sentence Improvement'],
          'Typing passages': ['Short passages', 'Medium passages', 'Long passages', 'Technical passages'],
        },
      },
      'Quantitative Aptitude': {
        domains: {
          'Number System': ['HCF & LCM', 'Fractions', 'Decimals', 'Squares & Cubes'],
          'Percentage': ['Percentage Basics', 'Change in Percentage', 'Combined Percentage', 'Population'],
          'Profit & Loss': ['CP & SP', 'Discount', 'Marked Price', 'Dishonest Dealer'],
          'Simple & Compound Interest': ['SI Formula', 'CI Formula', 'CI vs SI', 'Installments'],
          'Time & Work': ['Efficiency', 'Pipes & Cisterns', 'Wages', 'Men-Women-Days'],
        },
      },
      'Reasoning': {
        domains: {
          'Verbal Reasoning': ['Analogy', 'Classification', 'Series', 'Odd One Out'],
          'Logical Reasoning': ['Syllogism', 'Blood Relations', 'Direction Sense', 'Coding-Decoding'],
          'Non-Verbal Reasoning': ['Pattern', 'Mirror Image', 'Water Image', 'Paper Folding'],
        },
      },
    },
  },
  {
    name: 'Scientific Assistant',
    description: 'Kerala PSC Scientific Assistant Exam',
    category: 'PSC',
    subjects: {
      'Physics': {
        domains: {
          'Mechanics': ['Kinematics', 'Laws of Motion', 'Work & Energy', 'Rotational Motion'],
          'Thermodynamics': ['Heat', 'Laws of Thermodynamics', 'Kinetic Theory', 'Entropy'],
          'Electrostatics': ['Coulomb Law', 'Electric Field', 'Capacitors', 'Dielectrics'],
          'Current Electricity': ['Ohm Law', 'Kirchhoff Law', 'Wheatstone Bridge', 'Potentiometer'],
          'Magnetism': ['Earth Magnetism', 'Ampere Law', 'Electromagnetic Induction', 'AC Circuits'],
          'Optics': ['Reflection', 'Refraction', 'Lenses', 'Wave Optics'],
          'Modern Physics': ['Photoelectric Effect', 'Atomic Models', 'Nuclear Physics', 'Semiconductors'],
          'Waves & Oscillations': ['SHM', 'Sound Waves', 'Doppler Effect', 'Resonance'],
        },
      },
      'Chemistry': {
        domains: {
          'Atomic Structure': ['Bohr Model', 'Quantum Numbers', 'Electronic Configuration', 'Periodic Properties'],
          'Chemical Bonding': ['Ionic Bond', 'Covalent Bond', 'VSEPR Theory', 'Hybridization'],
          'States of Matter': ['Gas Laws', 'Liquids', 'Solutions', 'Colloids'],
          'Chemical Kinetics': ['Rate of Reaction', 'Activation Energy', 'Catalysis', 'Order of Reaction'],
          'Thermochemistry': ['Enthalpy', 'Hess Law', 'Entropy', 'Gibbs Energy'],
          'Equilibrium': ['Chemical Equilibrium', 'Ionic Equilibrium', 'pH', 'Buffer Solutions'],
          'Organic Chemistry': ['Hydrocarbons', 'Haloalkanes', 'Alcohols', 'Aldehydes & Ketones'],
          'Inorganic Chemistry': ['Coordination Compounds', 'Metallurgy', 'Qualitative Analysis', 's-Block Elements'],
          'Analytical Chemistry': ['Volumetric Analysis', 'Gravimetric Analysis', 'Instrumental Methods', 'Chromatography'],
        },
      },
      'Mathematics': {
        domains: {
          'Algebra': ['Quadratic Equations', 'Sequence & Series', 'Matrices', 'Determinants'],
          'Trigonometry': ['Trigonometric Ratios', 'Identities', 'Inverse Trigonometry', 'Heights & Distances'],
          'Calculus': ['Limits', 'Derivatives', 'Integrals', 'Differential Equations'],
          'Coordinate Geometry': ['Straight Lines', 'Circles', 'Conics', '3D Geometry'],
          'Probability & Statistics': ['Probability', 'Random Variables', 'Statistics', 'Regression'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Science & Tech', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
      'English': {
        domains: {
          'Grammar': ['Tenses', 'Articles', 'Prepositions', 'Voice Change'],
          'Vocabulary': ['Synonyms', 'Antonyms', 'One Word Substitution', 'Idioms & Phrases'],
          'Comprehension': ['Passage Reading', 'Cloze Test', 'Error Detection', 'Sentence Improvement'],
        },
      },
    },
  },
  {
    name: 'Assistant Engineer (Civil)',
    description: 'Kerala PSC Assistant Engineer Civil Exam',
    category: 'PSC',
    subjects: {
      'Structural Engineering': {
        domains: {
          'Structural Analysis': ['Determinacy', 'Trusses', 'Beams', 'Frames'],
          'Strength of Materials': ['Stress & Strain', 'Bending Moment', 'Shear Force', 'Deflection'],
          'Concrete Technology': ['Mix Design', 'Testing', 'Admixtures', 'Quality Control'],
          'Reinforced Concrete Design': ['Singly Reinforced', 'Doubly Reinforced', 'T-Beams', 'Slabs'],
          'Steel Structures': ['Connections', 'Tension Members', 'Compression Members', 'Beams'],
          'Foundation Design': ['Shallow Foundation', 'Deep Foundation', 'Pile Foundation', 'Caissons'],
        },
      },
      'Geotechnical Engineering': {
        domains: {
          'Soil Mechanics': ['Soil Properties', 'Classification', 'Compaction', 'Consolidation'],
          'Foundation Engineering': ['Bearing Capacity', 'Settlement', 'Slope Stability', 'Earth Pressure'],
          'Site Investigation': ['Exploration', 'Sampling', 'Lab Tests', 'Field Tests'],
        },
      },
      'Water Resources': {
        domains: {
          'Fluid Mechanics': ['Fluid Properties', 'Fluid Dynamics', 'Flow Measurement', 'Pipe Flow'],
          'Hydraulics': ['Open Channel Flow', 'Weirs', 'Notches', 'Turbines & Pumps'],
          'Irrigation Engineering': ['Water Requirements', 'Canal Design', 'Dams', 'Water Logging'],
          'Water Supply Engineering': ['Water Quality', 'Treatment', 'Distribution', 'Pumping'],
        },
      },
      'Transportation Engineering': {
        domains: {
          'Highway Engineering': ['Geometric Design', 'Pavement Design', 'Traffic Engineering', 'Highway Materials'],
          'Traffic Engineering': ['Traffic Studies', 'Intersection Design', 'Signal Design', 'Parking'],
          'Railway Engineering': ['Track Geometry', 'Gauges', 'Signalling', 'Stations'],
        },
      },
      'Surveying': {
        domains: {
          'Linear Measurement': ['Chain Survey', 'Compass Survey', 'Plane Table', 'Errors'],
          'Leveling': ['Dumpy Level', 'Contouring', 'Curves', 'Volume Calculation'],
          'Theodolite Survey': ['Horizontal Angles', 'Vertical Angles', 'Traversing', 'Triangulation'],
          'Modern Surveying': ['Total Station', 'GPS', 'GIS', 'Remote Sensing'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Engineering Tech', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'Assistant Engineer (Electrical)',
    description: 'Kerala PSC Assistant Engineer Electrical Exam',
    category: 'PSC',
    subjects: {
      'Circuit Theory': {
        domains: {
          'DC Circuits': ['Ohm Law', 'Kirchhoff Laws', 'Thevenin Theorem', 'Norton Theorem'],
          'AC Circuits': ['Phasor Diagram', 'Resonance', 'Power Factor', 'Three Phase Circuits'],
          'Network Analysis': ['Mesh Analysis', 'Node Analysis', 'Superposition', 'Maximum Power Transfer'],
          'Transient Analysis': ['RC Circuit', 'RL Circuit', 'RLC Circuit', 'Laplace Transform'],
        },
      },
      'Electrical Machines': {
        domains: {
          'DC Machines': ['DC Generator', 'DC Motor', 'Speed Control', 'Losses & Efficiency'],
          'Transformers': ['Working Principle', 'Equivalent Circuit', 'Losses', 'Testing'],
          'Induction Motor': ['Construction', 'Working', 'Torque-Speed', 'Starting Methods'],
          'Synchronous Machines': ['Alternator', 'Synchronous Motor', 'V-Curves', 'Parallel Operation'],
          'Special Machines': ['Stepper Motor', 'Servo Motor', 'Universal Motor', 'Reluctance Motor'],
        },
      },
      'Power Systems': {
        domains: {
          'Generation': ['Thermal', 'Hydro', 'Nuclear', 'Renewable Sources'],
          'Transmission': ['Overhead Lines', 'Cables', 'Insulators', 'Corona'],
          'Distribution': ['Primary Distribution', 'Secondary Distribution', 'Faults', 'Protection'],
          'Switchgear': ['Circuit Breakers', 'Relays', 'Fuses', 'Lightning Arresters'],
          'Power Economics': ['Tariff', 'Load Factor', 'Power Factor Improvement', 'Economics of Generation'],
        },
      },
      'Control Systems': {
        domains: {
          'Control System Basics': ['Open Loop', 'Closed Loop', 'Transfer Function', 'Block Diagram'],
          'Time Response': ['First Order', 'Second Order', 'Steady State Error', 'Specifications'],
          'Stability': ['Routh-Hurwitz', 'Root Locus', 'Nyquist', 'Bode Plot'],
          'Compensation': ['Lag Compensator', 'Lead Compensator', 'Lag-Lead', 'PID Controller'],
        },
      },
      'Power Electronics': {
        domains: {
          'Power Semiconductor Devices': ['Diode', 'SCR', 'MOSFET', 'IGBT'],
          'Rectifiers': ['Single Phase', 'Three Phase', 'Controlled', 'Uncontrolled'],
          'Inverters': ['Single Phase', 'Three Phase', 'PWM Techniques', 'Applications'],
          'Converters': ['Buck', 'Boost', 'Buck-Boost', 'Cuk'],
          'Drives': ['DC Motor Drive', 'Induction Motor Drive', 'VFD', 'Braking Methods'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Engineering Tech', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'Assistant Engineer (Mechanical)',
    description: 'Kerala PSC Assistant Engineer Mechanical Exam',
    category: 'PSC',
    subjects: {
      'Thermodynamics': {
        domains: {
          'Laws of Thermodynamics': ['Zeroth Law', 'First Law', 'Second Law', 'Third Law'],
          'Properties of Steam': ['Steam Formation', 'Mollier Chart', 'Steam Tables', 'Dryness Fraction'],
          'Air Standard Cycles': ['Otto Cycle', 'Diesel Cycle', 'Dual Cycle', 'Brayton Cycle'],
          'Vapor Power Cycles': ['Rankine Cycle', 'Reheat', 'Regeneration', 'Cogeneration'],
          'Refrigeration': ['VCRS', 'VAR System', 'Heat Pump', 'Psychrometry'],
        },
      },
      'Manufacturing': {
        domains: {
          'Casting': ['Sand Casting', 'Die Casting', 'Centrifugal Casting', 'Defects'],
          'Machining': ['Lathe', 'Milling', 'Drilling', 'Shaping'],
          'Welding': ['Arc Welding', 'Gas Welding', 'Resistance Welding', 'Defects'],
          'Forming': ['Forging', 'Rolling', 'Extrusion', 'Drawing'],
          'Foundry Technology': ['Pattern Making', 'Moulding', 'Coring', 'Casting Design'],
        },
      },
      'Design': {
        domains: {
          'Machine Design': ['Stresses', 'Fatigue', 'Bolts & Rivets', 'Welded Joints'],
          'Design of Transmission': ['Shafts', 'Keys & Couplings', 'Belts & Ropes', 'Chains'],
          'Bearings': ['Sliding Contact', 'Rolling Contact', 'Lubrication', 'Failure Analysis'],
          'Springs': ['Helical', 'Leaf', 'Torsion', 'Springs in Instruments'],
          'Cams & Gears': ['Cam Profiles', 'Gear Terminology', 'Gear Trains', 'Epicyclic Gears'],
        },
      },
      'Fluid Mechanics': {
        domains: {
          'Fluid Properties': ['Density', 'Viscosity', 'Surface Tension', 'Compressibility'],
          'Fluid Statics': ['Pressure', 'Buoyancy', 'Forces on Plane', 'Forces on Curved Surface'],
          'Fluid Dynamics': ['Bernoulli Equation', 'Venturi Meter', 'Orifice Meter', 'Pitot Tube'],
          'Flow Through Pipes': ['Laminar Flow', 'Turbulent Flow', 'Minor Losses', 'Pipe Networks'],
          'Open Channel Flow': ['Froude Number', 'Hydraulic Jump', 'Weirs', 'Notches'],
        },
      },
      'Industrial Engineering': {
        domains: {
          'Production Planning': ['Forecasting', 'Aggregate Planning', 'MRP', 'JIT'],
          'Inventory Control': ['EOQ', 'ABC Analysis', 'Safety Stock', 'Reorder Level'],
          'Quality Control': ['TQM', 'Six Sigma', 'Statistical QC', 'Reliability'],
          'Operations Research': ['Linear Programming', 'Transportation', 'Queuing Theory', 'Game Theory'],
          'Work Study': ['Method Study', 'Time Study', 'Motion Study', 'Rating & Allowances'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Engineering Tech', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'Section Officer',
    description: 'Kerala PSC Section Officer Exam',
    category: 'PSC',
    subjects: {
      'Commerce': {
        domains: {
          'Business Organisation': ['Forms of Business', 'Company Formation', 'Business Functions', 'Corporate Governance'],
          'Business Economics': ['Demand Analysis', 'Production', 'Market Structures', 'Price Determination'],
          'Business Statistics': ['Measure of Central Tendency', 'Correlation', 'Index Numbers', 'Sampling'],
        },
      },
      'Accountancy': {
        domains: {
          'Financial Accounting': ['Journal Entries', 'Ledger', 'Trial Balance', 'Final Accounts'],
          'Company Accounts': ['Issue of Shares', 'Issue of Debentures', 'Redemption', 'Bonus Issue'],
          'Cost & Management Accounting': ['Cost Classification', 'Marginal Costing', 'Budgeting', 'Variance Analysis'],
        },
      },
      'Auditing': {
        domains: {
          'Audit Principles': ['Audit Planning', 'Audit Evidence', 'Audit Risk', 'Materiality'],
          'Vouching': ['Cash Transactions', 'Purchase Transactions', 'Sales Transactions', 'Assets Verification'],
          'Company Audit': ['Statutory Audit', 'Internal Audit', 'Tax Audit', 'Audit Report'],
        },
      },
      'Business Law': {
        domains: {
          'Indian Contract Act': ['Offer & Acceptance', 'Consideration', 'Breach', 'Remedies'],
          'Companies Act': ['Formation', 'Directors', 'Meetings', 'Winding Up'],
          'Negotiable Instruments': ['Bills of Exchange', 'Promissory Notes', 'Cheques', 'Endorsement'],
        },
      },
      'Office Management': {
        domains: {
          'Office Procedures': ['Filing', 'Correspondence', 'Noting & Drafting', 'Record Management'],
          'Office Automation': ['MS Office', 'Email Management', 'Database Management', 'Video Conferencing'],
          'Human Resources': ['Recruitment', 'Training', 'Performance Appraisal', 'Grievance Handling'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'Librarian',
    description: 'Kerala PSC Librarian Exam',
    category: 'PSC',
    subjects: {
      'Library Science': {
        domains: {
          'Library Philosophy': ['Definitions', 'Types of Libraries', 'Library Laws', 'Library Movement in India'],
          'Library Classification': ['Colon Classification', 'DDC', 'CCF', 'Subject Classification'],
          'Library Cataloguing': ['AACR2', 'CRG', 'MARC', 'OPAC'],
          'Reference Service': ['Reference Sources', 'Information Sources', 'Bibliography', 'SDI'],
        },
      },
      'Classification Systems': {
        domains: {
          'DDC': ['Tables', 'Schedules', 'Number Building', 'Application'],
          'Colon Classification': ['Basic Classes', 'Common Isolates', 'Time Isolates', 'Space Isolates'],
          'Universal Decimal Classification': ['Auxiliary Tables', 'Notation', 'Synthesis', 'Application'],
          'Subject Heading Lists': ['Sears List', 'LCSH', 'ASHI', 'Form Headings'],
        },
      },
      'Information Science': {
        domains: {
          'Information Sources': ['Primary', 'Secondary', 'Tertiary', 'Electronic Sources'],
          'Information Technology': ['Library Software', 'Digital Library', 'Database Systems', 'Networking'],
          'Information Retrieval': ['Boolean Search', 'Subject Indexing', 'Abstracting', 'Citation Analysis'],
        },
      },
      'Library Management': {
        domains: {
          'Collection Development': ['Selection', 'Weeding', 'Acquisition', 'Gift & Donation'],
          'Library Administration': ['Planning', 'Organizing', 'Staffing', 'Budgeting'],
          'Reading Habits': ['Reading Promotion', 'Book Fair', 'Literary Events', 'User Studies'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'Physical Education Teacher',
    description: 'Kerala PSC Physical Education Teacher Exam',
    category: 'PSC',
    subjects: {
      'Anatomy': {
        domains: {
          'Skeletal System': ['Bones', 'Joints', 'Muscles', 'Connective Tissue'],
          'Muscular System': ['Muscle Types', 'Muscle Contraction', 'Muscle Fiber Types', 'Muscle Fatigue'],
          'Cardiovascular System': ['Heart', 'Blood Vessels', 'Blood', 'Circulation During Exercise'],
          'Respiratory System': ['Lungs', 'Ventilation', 'Gas Exchange', 'Respiratory Muscles'],
          'Nervous System': ['Central Nervous System', 'Peripheral Nervous System', 'Neuromuscular Junction', 'Reflexes'],
        },
      },
      'Physiology': {
        domains: {
          'Exercise Physiology': ['Energy Systems', 'VO2 Max', 'Lactate Threshold', 'Recovery'],
          'Endocrinology': ['Hormones', 'Growth Hormone', 'Testosterone', 'Cortisol'],
          'Nutrition': ['Macronutrients', 'Micronutrients', 'Hydration', 'Sports Nutrition'],
          'Thermoregulation': ['Heat Loss', 'Heat Gain', 'Sweating', 'Acclimatization'],
        },
      },
      'Sports Psychology': {
        domains: {
          'Motivation': ['Intrinsic Motivation', 'Extrinsic Motivation', 'Goal Setting', 'Achievement Motivation'],
          'Anxiety & Arousal': ['Competition Anxiety', 'Arousal Regulation', 'Imagery', 'Relaxation'],
          'Team Dynamics': ['Cohesion', 'Communication', 'Leadership', 'Conflict Resolution'],
          'Mental Skills': ['Concentration', 'Self-Talk', 'Visualization', 'Confidence Building'],
        },
      },
      'Sports Training': {
        domains: {
          'Training Principles': ['Overload', 'Specificity', 'Recovery', 'Periodization'],
          'Fitness Components': ['Cardiovascular', 'Strength', 'Flexibility', 'Speed & Agility'],
          'Sports Skills': ['Motor Learning', 'Skill Acquisition', 'Practice Methods', 'Transfer of Training'],
          'Injury Prevention': ['Warm-Up', 'Cool-Down', 'Stretching', 'Common Sports Injuries'],
        },
      },
      'Health Education': {
        domains: {
          'Personal Health': ['Hygiene', 'Disease Prevention', 'First Aid', 'Mental Health'],
          'Community Health': ['Public Health', 'Health Promotion', 'Sanitation', 'Epidemiology Basics'],
          'Yoga & Meditation': ['Asanas', 'Pranayama', 'Meditation Techniques', 'Benefits'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Sports & Awards', 'Kerala State'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'Statistical Assistant',
    description: 'Kerala PSC Statistical Assistant Exam',
    category: 'PSC',
    subjects: {
      'Statistics': {
        domains: {
          'Descriptive Statistics': ['Mean', 'Median', 'Mode', 'Standard Deviation'],
          'Probability': ['Basic Probability', 'Conditional Probability', 'Bayes Theorem', 'Distributions'],
          'Statistical Inference': ['Estimation', 'Hypothesis Testing', 'Z-Test', 'T-Test'],
          'Regression & Correlation': ['Simple Regression', 'Multiple Regression', 'Correlation Coefficient', 'R-Square'],
          'Sampling Methods': ['Simple Random', 'Stratified', 'Cluster', 'Systematic Sampling'],
          'Index Numbers': ['Laspeyres', 'Paasche', 'Fisher', 'Cost of Living Index'],
          'Time Series Analysis': ['Trend', 'Seasonal Variation', 'Cyclical Variation', 'Irregular Variation'],
          'ANOVA': ['One-Way ANOVA', 'Two-Way ANOVA', 'F-Test', 'Post-Hoc Tests'],
        },
      },
      'Mathematics': {
        domains: {
          'Algebra': ['Quadratic Equations', 'Sequence & Series', 'Matrices', 'Determinants'],
          'Calculus': ['Limits', 'Derivatives', 'Integrals', 'Differential Equations'],
          'Coordinate Geometry': ['Straight Lines', 'Circles', 'Conics', '3D Geometry'],
          'Trigonometry': ['Trigonometric Ratios', 'Identities', 'Inverse Trigonometry', 'Heights & Distances'],
        },
      },
      'Computer Applications': {
        domains: {
          'MS Excel': ['Formulas', 'Charts', 'Pivot Tables', 'Data Analysis Toolpak'],
          'Statistical Software': ['SPSS Basics', 'R Basics', 'Python for Statistics', 'Data Visualization'],
          'Database Management': ['SQL Basics', 'Data Entry', 'Data Cleaning', 'Reporting'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
      'English': {
        domains: {
          'Grammar': ['Tenses', 'Articles', 'Prepositions', 'Voice Change'],
          'Vocabulary': ['Synonyms', 'Antonyms', 'One Word Substitution', 'Idioms & Phrases'],
          'Comprehension': ['Passage Reading', 'Cloze Test', 'Error Detection', 'Sentence Improvement'],
        },
      },
    },
  },
  {
    name: 'Civil Police Officer',
    description: 'Kerala PSC Civil Police Officer Exam',
    category: 'PSC',
    subjects: {
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Geography': ['Physical Geography', 'Climate', 'Rivers', 'Soils'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
          'General Science': ['Physics Basics', 'Chemistry Basics', 'Biology Basics', 'Computer Basics'],
        },
      },
      'Reasoning': {
        domains: {
          'Verbal Reasoning': ['Analogy', 'Classification', 'Series', 'Odd One Out'],
          'Logical Reasoning': ['Syllogism', 'Blood Relations', 'Direction Sense', 'Coding-Decoding'],
          'Non-Verbal Reasoning': ['Pattern', 'Mirror Image', 'Water Image', 'Paper Folding'],
          'Puzzles': ['Seating Arrangement', 'Floor Puzzle', 'Box Puzzle', 'Scheduling'],
          'Data Sufficiency': ['Quantitative', 'Logical', 'Data Sufficiency mixed'],
        },
      },
      'English': {
        domains: {
          'Grammar': ['Tenses', 'Articles', 'Prepositions', 'Voice Change'],
          'Vocabulary': ['Synonyms', 'Antonyms', 'One Word Substitution', 'Idioms & Phrases'],
          'Comprehension': ['Passage Reading', 'Cloze Test', 'Error Detection', 'Sentence Improvement'],
        },
      },
      'Quantitative Aptitude': {
        domains: {
          'Number System': ['HCF & LCM', 'Fractions', 'Decimals', 'Squares & Cubes'],
          'Percentage': ['Percentage Basics', 'Change in Percentage', 'Combined Percentage', 'Population'],
          'Profit & Loss': ['CP & SP', 'Discount', 'Marked Price', 'Dishonest Dealer'],
          'Simple & Compound Interest': ['SI Formula', 'CI Formula', 'CI vs SI', 'Installments'],
          'Time & Work': ['Efficiency', 'Pipes & Cisterns', 'Wages', 'Men-Women-Days'],
          'Time & Distance': ['Speed', 'Trains', 'Boats & Streams', 'Relative Speed'],
        },
      },
      'Indian Penal Code': {
        domains: {
          'General Principles': ['Definitions', 'Mens Rea', 'Actus Reus', 'Joint Liability'],
          'Offences Against Body': ['Murder', 'Culpable Homicide', 'Kidnapping', 'Assault'],
          'Offences Against Property': ['Theft', 'Robbery', 'Dacoity', 'Criminal Breach of Trust'],
          'Offences Against Women': ['Dowry Death', 'Eve Teasing', 'Domestic Violence', 'Acid Attack'],
        },
      },
      'Criminal Procedure': {
        domains: {
          'Investigation': ['FIR', 'Arrest', 'Search & Seizure', 'Bail'],
          'Trial': ['Cognizable Offences', 'Non-Cognizable Offences', 'Bailable Offences', 'Non-Bailable Offences'],
          'Evidence': ['Admissibility', 'Examination of Witnesses', 'Confession', 'Dying Declaration'],
          'Sentencing': ['Punishments', 'Probation', 'Fine', 'Imprisonment'],
        },
      },
    },
  },
  {
    name: 'Fire and Safety Officer',
    description: 'Kerala PSC Fire and Safety Officer Exam',
    category: 'PSC',
    subjects: {
      'Fire Science': {
        domains: {
          'Fire Triangle': ['Fuel', 'Heat', 'Oxygen', 'Chain Reaction'],
          'Fire Classification': ['Class A', 'Class B', 'Class C', 'Class D & K'],
          'Fire Behaviour': ['Flash Point', 'Ignition Temperature', 'Heat Transfer', 'Fire Spread'],
          'Fire Extinguishing': ['Water', 'Foam', 'CO2', 'Dry Chemical Powder'],
        },
      },
      'Safety Management': {
        domains: {
          'Industrial Safety': ['Safety Audit', 'Risk Assessment', 'Safety Policy', 'PPE'],
          'Building Safety': ['Fire Escape Routes', 'Emergency Exits', 'Fire Alarm Systems', 'Sprinkler Systems'],
          'Electrical Safety': ['Earthing', 'Overload Protection', 'Short Circuit', 'Fire from Electrical'],
          'Chemical Safety': ['MSDS', 'Hazardous Materials', 'Storage', 'Spill Response'],
        },
      },
      'Disaster Management': {
        domains: {
          'Disaster Preparedness': ['Planning', 'Warning Systems', 'Communication', 'Resource Management'],
          'Response & Recovery': ['Search & Rescue', 'First Aid', 'Relief Operations', 'Rehabilitation'],
          'Natural Disasters': ['Earthquakes', 'Floods', 'Cyclones', 'Landslides'],
          'Man-Made Disasters': ['Industrial Accidents', 'Chemical Spills', 'Building Collapse', 'Explosions'],
        },
      },
      'Building Construction': {
        domains: {
          'Building Materials': ['Concrete', 'Steel', 'Bricks', 'Timber'],
          'Fire Resistance': ['Fire Rating', 'Fire Walls', 'Fire Doors', 'Fireproofing'],
          'Building Codes': ['NBC', 'KBR', 'Fire Safety Norms', 'Occupancy Certificate'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Disaster News', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'Forest Guard',
    description: 'Kerala PSC Forest Guard Exam',
    category: 'PSC',
    subjects: {
      'Forestry': {
        domains: {
          'Forest Types': ['Tropical', 'Subtropical', 'Temperate', 'Mangrove'],
          'Forest Management': ['Silviculture', 'Afforestation', 'Deforestation', 'Reforestation'],
          'Forest Products': ['Timber', 'Non-Timber', 'Minor Forest Produce', 'Medicinal Plants'],
          'Forest Conservation': ['Wildlife Protection Act', 'Forest Act', 'National Forest Policy', 'Joint Forest Management'],
        },
      },
      'Wildlife': {
        domains: {
          'Wildlife of Kerala': ['Mammals', 'Birds', 'Reptiles', 'Amphibians'],
          'Endangered Species': ['Tiger', 'Elephant', 'Lion-Tailed Macaque', 'Nilgiri Tahr'],
          'Protected Areas': ['National Parks', 'Wildlife Sanctuaries', 'Tiger Reserves', 'Biosphere Reserves'],
          'Wildlife Laws': ['CITES', 'IUCN', 'Wildlife Protection Act', 'Project Tiger'],
        },
      },
      'Environmental Science': {
        domains: {
          'Ecology': ['Ecosystem', 'Food Chain', 'Food Web', 'Ecological Succession'],
          'Biodiversity': ['Genetic Diversity', 'Species Diversity', 'Ecosystem Diversity', 'Hotspots'],
          'Pollution': ['Air', 'Water', 'Soil', 'Noise'],
          'Climate Change': ['Global Warming', 'Greenhouse Effect', 'Ozone Depletion', 'Carbon Footprint'],
        },
      },
      'Geography': {
        domains: {
          'Physical Geography': ['Mountains', 'Rivers', 'Plains', 'Plateaus'],
          'Kerala Geography': ['Western Ghats', 'Backwaters', 'Rivers', 'Climate'],
          'Climate': ['Monsoon', 'Climate Classification', 'Climate Zones', 'Weather Patterns'],
          'Soil & Vegetation': ['Soil Types', 'Forest Cover', 'Grasslands', 'Desert'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Environment News', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'Matron',
    description: 'Kerala PSC Matron Exam',
    category: 'PSC',
    subjects: {
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Geography': ['Physical Geography', 'Climate', 'Rivers', 'Soils'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
        },
      },
      'General Science': {
        domains: {
          'Physics Basics': ['Motion', 'Force', 'Energy', 'Light & Sound'],
          'Chemistry Basics': ['Elements', 'Compounds', 'Acids & Bases', 'Chemical Reactions'],
          'Biology Basics': ['Human Body', 'Diseases', 'Nutrition', 'Hygiene'],
        },
      },
      'Home Science': {
        domains: {
          'Food & Nutrition': ['Balanced Diet', 'Cooking Methods', 'Food Preservation', 'Malnutrition'],
          'Textiles': ['Fibres', 'Fabrics', 'Dyeing', 'Garment Care'],
          'Housekeeping': ['Cleaning', 'Sanitation', 'Waste Management', 'Pest Control'],
          'Child Care': ['Child Development', 'Immunization', 'Common Ailments', 'First Aid'],
        },
      },
      'Nutrition': {
        domains: {
          'Macronutrients': ['Carbohydrates', 'Proteins', 'Fats', 'Water'],
          'Micronutrients': ['Vitamins', 'Minerals', 'Deficiency Diseases', 'Rich Sources'],
          'Diet Planning': ['Balanced Diet', 'Therapeutic Diets', 'Diet for Elderly', 'Diet for Children'],
          'Food Safety': ['Food Adulteration', 'Food Hygiene', 'FSSAI', 'Preservation Methods'],
        },
      },
      'Health and Hygiene': {
        domains: {
          'Personal Hygiene': ['Bathing', 'Dental Care', 'Hand Washing', 'Grooming'],
          'Environmental Hygiene': ['Water Sanitation', 'Air Quality', 'Waste Disposal', 'Vector Control'],
          'Communicable Diseases': ['TB', 'Malaria', 'Dengue', 'COVID-19'],
          'Non-Communicable Diseases': ['Diabetes', 'Hypertension', 'Heart Disease', 'Cancer'],
        },
      },
    },
  },
  {
    name: 'Hostel Superintendent',
    description: 'Kerala PSC Hostel Superintendent Exam',
    category: 'PSC',
    subjects: {
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Geography': ['Physical Geography', 'Climate', 'Rivers', 'Soils'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
        },
      },
      'Office Management': {
        domains: {
          'Office Procedures': ['Filing', 'Correspondence', 'Noting & Drafting', 'Record Management'],
          'Office Automation': ['MS Office', 'Email Management', 'Database Management', 'Video Conferencing'],
          'Human Resources': ['Recruitment', 'Training', 'Performance Appraisal', 'Grievance Handling'],
        },
      },
      'Accountancy': {
        domains: {
          'Book Keeping': ['Single Entry', 'Double Entry', 'Journal Entries', 'Ledger'],
          'Financial Accounting': ['Trial Balance', 'Final Accounts', 'Depreciation', 'Inventory'],
          'Budgeting': ['Hostel Budget', 'Expenditure Control', 'Audit', 'Financial Reporting'],
        },
      },
      'Hostel Administration': {
        domains: {
          'Hostel Management': ['Admission', 'Room Allocation', 'Discipline', 'Visitor Management'],
          'Mess Management': ['Menu Planning', 'Food Quality', 'Budgeting', 'Vendor Management'],
          'Maintenance': ['Building Maintenance', 'Electrical', 'Plumbing', 'Safety'],
          'Student Welfare': ['Counselling', 'Recreation', 'Health', 'Anti-Ragging'],
          'Hostel Rules': ['Rules & Regulations', 'Punishments', 'Committee Formation', 'Grievance Redressal'],
        },
      },
      'English': {
        domains: {
          'Grammar': ['Tenses', 'Articles', 'Prepositions', 'Voice Change'],
          'Vocabulary': ['Synonyms', 'Antonyms', 'One Word Substitution', 'Idioms & Phrases'],
          'Comprehension': ['Passage Reading', 'Cloze Test', 'Error Detection', 'Letter Writing'],
        },
      },
    },
  },
  {
    name: "Women's Civil Excise Officer",
    description: 'Kerala PSC Women Civil Excise Officer Exam',
    category: 'PSC',
    subjects: {
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Geography': ['Physical Geography', 'Climate', 'Rivers', 'Soils'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
          'General Science': ['Physics Basics', 'Chemistry Basics', 'Biology Basics', 'Computer Basics'],
        },
      },
      'Reasoning': {
        domains: {
          'Verbal Reasoning': ['Analogy', 'Classification', 'Series', 'Odd One Out'],
          'Logical Reasoning': ['Syllogism', 'Blood Relations', 'Direction Sense', 'Coding-Decoding'],
          'Non-Verbal Reasoning': ['Pattern', 'Mirror Image', 'Water Image', 'Paper Folding'],
          'Puzzles': ['Seating Arrangement', 'Floor Puzzle', 'Box Puzzle', 'Scheduling'],
        },
      },
      'English': {
        domains: {
          'Grammar': ['Tenses', 'Articles', 'Prepositions', 'Voice Change'],
          'Vocabulary': ['Synonyms', 'Antonyms', 'One Word Substitution', 'Idioms & Phrases'],
          'Comprehension': ['Passage Reading', 'Cloze Test', 'Error Detection', 'Sentence Improvement'],
        },
      },
      'Quantitative Aptitude': {
        domains: {
          'Number System': ['HCF & LCM', 'Fractions', 'Decimals', 'Squares & Cubes'],
          'Percentage': ['Percentage Basics', 'Change in Percentage', 'Combined Percentage', 'Population'],
          'Profit & Loss': ['CP & SP', 'Discount', 'Marked Price', 'Dishonest Dealer'],
          'Simple & Compound Interest': ['SI Formula', 'CI Formula', 'CI vs SI', 'Installments'],
          'Time & Work': ['Efficiency', 'Pipes & Cisterns', 'Wages', 'Men-Women-Days'],
          'Time & Distance': ['Speed', 'Trains', 'Boats & Streams', 'Relative Speed'],
        },
      },
      'Excise Laws': {
        domains: {
          'Kerala Excise Act': ['Provisions', 'Licensing', 'Penalties', 'Forfeiture'],
          'NDPS Act': ['Provisions', 'Possession', 'Trafficking', 'Punishment'],
          'Prohibition': ['Liquor Policy', 'Bootlegging', 'Spurious Liquor', 'Enforcement'],
          'Investigation': ['Search & Seizure', 'Arrest', 'Bail', 'Court Procedures'],
        },
      },
    },
  },
  {
    name: 'Assistant Tourism Officer',
    description: 'Kerala PSC Assistant Tourism Officer Exam',
    category: 'PSC',
    subjects: {
      'Tourism Studies': {
        domains: {
          'Tourism Concepts': ['Definition', 'Types of Tourism', 'Tourism Products', 'Sustainable Tourism'],
          'Tourism Planning': ['Planning Process', 'Policy', 'Infrastructure', 'Marketing'],
          'Tourism Impacts': ['Economic', 'Social', 'Cultural', 'Environmental'],
          'Travel & Tour Operations': ['Tour Packaging', 'Itinerary Planning', 'Costing', 'Booking Systems'],
        },
      },
      'Geography': {
        domains: {
          'Physical Geography': ['Mountains', 'Rivers', 'Climate', 'Vegetation'],
          'Kerala Geography': ['Districts', 'Backwaters', 'Hill Stations', 'Beaches'],
          'Indian Geography': ['Major Tourist Circuits', 'Heritage Sites', 'National Parks', 'Pilgrimage Centers'],
          'World Geography': ['Continents', 'Countries', 'Climate Zones', 'UNESCO Sites'],
        },
      },
      'History': {
        domains: {
          'Indian History': ['Ancient', 'Medieval', 'Modern', 'Freedom Struggle'],
          'World History': ['Ancient Civilizations', 'Renaissance', 'World Wars', 'Cold War'],
          'Kerala History': ['Chera Dynasty', 'Colonial Period', 'Travancore', 'Kerala Formation'],
          'Art & Culture': ['Classical Arts', 'Folk Arts', 'Architecture', 'Literature'],
        },
      },
      'Culture': {
        domains: {
          'Kerala Art Forms': ['Kathakali', 'Mohiniyattam', 'Theyyam', 'Koodiyattam'],
          'Kerala Festivals': ['Onam', 'Vishu', 'Thrissur Pooram', 'Boat Race'],
          'Kerala Cuisine': ['Sadya', 'Fish Curry', 'Appam', 'Puttu'],
          'Heritage Sites': ['Fort Kochi', 'Padmanabhapuram Palace', 'Bekal Fort', 'Mattancherry'],
        },
      },
      'Hotel Management': {
        domains: {
          'Front Office': ['Reception', 'Reservation', 'Check-in/Check-out', 'Guest Relations'],
          'Housekeeping': ['Room Cleaning', 'Laundry', 'Inventory', 'Quality Control'],
          'Food & Beverage': ['Restaurant Service', 'Bar Service', 'Banquet', 'Room Service'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Tourism News', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'Information Officer',
    description: 'Kerala PSC Information Officer Exam',
    category: 'PSC',
    subjects: {
      'Mass Communication': {
        domains: {
          'Communication Theory': ['Models', 'Process', 'Barriers', 'Mass Media'],
          'Journalism': ['Print Media', 'Electronic Media', 'Online Media', 'Photojournalism'],
          'Advertising': ['Types', 'Media Planning', 'Creative Strategy', 'Budgeting'],
          'Public Relations': ['PR Tools', 'Crisis Management', 'Corporate Communication', 'Media Relations'],
        },
      },
      'Journalism': {
        domains: {
          'News Writing': ['News Values', 'News Story', 'Feature Writing', 'Editorial'],
          'Reporting': ['Investigative', 'Beat Reporting', 'Parliamentary', 'Sports'],
          'Editing': ['Copy Editing', 'Headline Writing', 'Proofreading', 'Page Layout'],
          'Media Ethics': ['Press Council', 'Code of Ethics', 'Right to Information', 'Defamation'],
        },
      },
      'Media Laws': {
        domains: {
          'Press Laws': ['Press Council Act', 'Indian Penal Code', 'Official Secrets Act', 'Contempt of Court'],
          'RTI Act': ['Provisions', 'Information Commission', 'Penalties', 'Exemptions'],
          'Cyber Laws': ['IT Act', 'Cyber Crimes', 'Data Protection', 'Social Media Regulations'],
          'Intellectual Property': ['Copyright', 'Trademark', 'Patent', 'Plagiarism'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Media & Tech', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
      'English': {
        domains: {
          'Grammar': ['Tenses', 'Articles', 'Prepositions', 'Voice Change'],
          'Vocabulary': ['Synonyms', 'Antonyms', 'One Word Substitution', 'Idioms & Phrases'],
          'Comprehension': ['Passage Reading', 'Cloze Test', 'Error Detection', 'Sentence Improvement'],
        },
      },
    },
  },
  {
    name: 'Pharmacist',
    description: 'Kerala PSC Pharmacist Exam',
    category: 'PSC',
    subjects: {
      'Pharmacology': {
        domains: {
          'General Pharmacology': ['Pharmacokinetics', 'Pharmacodynamics', 'Adverse Drug Reactions', 'Drug Interactions'],
          'Autonomic Nervous System': ['Cholinergic Drugs', 'Adrenergic Drugs', 'Ganglionic Blockers', 'Neuromuscular Blockers'],
          'CNS Drugs': ['Sedatives', 'Antiepileptics', 'Antipsychotics', 'Analgesics'],
          'Cardiovascular Drugs': ['Antihypertensives', 'Antiarrhythmics', 'Antianginals', 'Diuretics'],
          'Chemotherapy': ['Antibiotics', 'Antifungals', 'Antivirals', 'Antimalarials'],
        },
      },
      'Pharmaceutics': {
        domains: {
          'Dosage Forms': ['Tablets', 'Capsules', 'Liquids', 'Injectables'],
          'Dispensing Pharmacy': ['Prescription', 'Dispensing', 'Incompatibilities', 'Storage'],
          'Pharmaceutical Manufacturing': ['Granulation', 'Compression', 'Coating', 'Sterilization'],
          'Novel Drug Delivery': ['Sustained Release', 'Controlled Release', 'Liposomes', 'Nanoparticles'],
        },
      },
      'Chemistry': {
        domains: {
          'Inorganic Pharmacy': ['Antacids', 'Cathartics', 'Antimicrobials', 'Expectorants'],
          'Organic Pharmacy': ['Nomenclature', 'Functional Groups', 'Reactions', 'Synthesis'],
          'Pharmaceutical Analysis': ['Titration', 'Spectrophotometry', 'Chromatography', 'Assay Methods'],
        },
      },
      'Anatomy': {
        domains: {
          'Skeletal System': ['Bones', 'Joints', 'Muscles', 'Connective Tissue'],
          'Cardiovascular System': ['Heart', 'Blood Vessels', 'Blood', 'Circulation'],
          'Respiratory System': ['Lungs', 'Trachea', 'Bronchi', 'Diaphragm'],
          'Digestive System': ['Stomach', 'Intestines', 'Liver', 'Pancreas'],
        },
      },
      'Physiology': {
        domains: {
          'Blood Physiology': ['Blood Components', 'Blood Groups', 'Clotting', 'ESR'],
          'Cardiovascular Physiology': ['Cardiac Cycle', 'Blood Pressure', 'ECG', 'Heart Rate'],
          'Renal Physiology': ['Filtration', 'Reabsorption', 'Secretion', 'Urine Formation'],
          'Nervous System Physiology': ['Neuron', 'Synapse', 'Reflexes', 'Brain Functions'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Health & Pharma', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'Health Inspector',
    description: 'Kerala PSC Health Inspector Exam',
    category: 'PSC',
    subjects: {
      'Public Health': {
        domains: {
          'Community Health': ['Primary Health Care', 'PHC', 'Health Programmes', 'Health Education'],
          'Epidemiology': ['Disease Transmission', 'Epidemic Investigation', 'Surveillance', 'Prevention'],
          'Environmental Health': ['Water Quality', 'Air Quality', 'Noise', 'Waste Management'],
          'Health Statistics': ['Vital Statistics', 'Morbidity', 'Mortality', 'Health Indicators'],
        },
      },
      'Sanitation': {
        domains: {
          'Water Sanitation': ['Water Treatment', 'Water Quality Testing', 'Pipe Water Supply', 'Well Water'],
          'Solid Waste Management': ['Collection', 'Transportation', 'Disposal', 'Recycling'],
          'Excreta Disposal': ['Latrines', 'Sewage Treatment', 'Septic Tanks', 'Bio-digesters'],
          'Vector Control': ['Mosquito Control', 'Rat Control', 'Flies Control', 'Chemical Methods'],
        },
      },
      'Epidemiology': {
        domains: {
          'Communicable Diseases': ['Malaria', 'Dengue', 'TB', 'Cholera'],
          'Non-Communicable Diseases': ['Diabetes', 'Hypertension', 'Cancer', 'Heart Disease'],
          'Immunization': ['EPI Schedule', 'Vaccine Storage', 'Cold Chain', 'Adverse Events'],
          'Outbreak Investigation': ['Field Investigation', 'Sample Collection', 'Case Definition', 'Control Measures'],
        },
      },
      'Nutrition': {
        domains: {
          'Nutrition Basics': ['Macronutrients', 'Micronutrients', 'Balanced Diet', 'Calorie Requirements'],
          'Malnutrition': ['Protein Energy Malnutrition', 'Vitamin Deficiency', 'Iron Deficiency', 'Iodine Deficiency'],
          'Nutrition Programmes': ['ICDS', 'Mid-Day Meal', 'POSHAN', 'Balwadi'],
          'Food Safety': ['Food Adulteration', 'FSSAI', 'Food Testing', 'Food Handlers Health'],
        },
      },
      'Environmental Health': {
        domains: {
          'Pollution': ['Air Pollution', 'Water Pollution', 'Soil Pollution', 'Noise Pollution'],
          'Occupational Health': ['Industrial Health', 'PPE', 'Occupational Diseases', 'Health Check-ups'],
          'Disaster Health': ['Flood Health Risks', 'Epidemic After Disaster', 'Waterborne Diseases', 'First Aid'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Health News', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'Degree Level Non Technical',
    description: 'Kerala PSC Degree Level Non Technical Exam',
    category: 'PSC',
    subjects: {
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Geography': ['Physical Geography', 'Climate', 'Rivers', 'Soils'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
          'General Science': ['Physics Basics', 'Chemistry Basics', 'Biology Basics', 'Computer Basics'],
          'Economy': ['Indian Economy', 'Banking', 'Budget', 'Five Year Plans'],
          'Environment': ['Ecology', 'Biodiversity', 'Pollution', 'Climate Change'],
        },
      },
      'Reasoning': {
        domains: {
          'Verbal Reasoning': ['Analogy', 'Classification', 'Series', 'Odd One Out'],
          'Logical Reasoning': ['Syllogism', 'Blood Relations', 'Direction Sense', 'Coding-Decoding'],
          'Non-Verbal Reasoning': ['Pattern', 'Mirror Image', 'Water Image', 'Paper Folding'],
          'Puzzles': ['Seating Arrangement', 'Floor Puzzle', 'Box Puzzle', 'Scheduling'],
          'Data Sufficiency': ['Quantitative', 'Logical', 'Data Sufficiency mixed'],
        },
      },
      'Quantitative Aptitude': {
        domains: {
          'Number System': ['HCF & LCM', 'Fractions', 'Decimals', 'Squares & Cubes'],
          'Percentage': ['Percentage Basics', 'Change in Percentage', 'Combined Percentage', 'Population'],
          'Profit & Loss': ['CP & SP', 'Discount', 'Marked Price', 'Dishonest Dealer'],
          'Simple & Compound Interest': ['SI Formula', 'CI Formula', 'CI vs SI', 'Installments'],
          'Time & Work': ['Efficiency', 'Pipes & Cisterns', 'Wages', 'Men-Women-Days'],
          'Time & Distance': ['Speed', 'Trains', 'Boats & Streams', 'Relative Speed'],
          'Data Interpretation': ['Tables', 'Bar Graphs', 'Pie Charts', 'Line Graphs'],
        },
      },
      'English': {
        domains: {
          'Grammar': ['Tenses', 'Articles', 'Prepositions', 'Voice Change'],
          'Vocabulary': ['Synonyms', 'Antonyms', 'One Word Substitution', 'Idioms & Phrases'],
          'Comprehension': ['Passage Reading', 'Cloze Test', 'Sentence Rearrangement', 'Error Detection'],
        },
      },
      'Computer Awareness': {
        domains: {
          'Computer Fundamentals': ['Hardware', 'Software', 'Input-Output Devices', 'Memory'],
          'MS Office': ['MS Word', 'MS Excel', 'MS PowerPoint', 'MS Access'],
          'Internet & Networking': ['Internet Basics', 'Email', 'Browsers', 'Network Types'],
          'Computer Security': ['Virus', 'Firewall', 'Antivirus', 'Cyber Safety'],
        },
      },
      'General Science': {
        domains: {
          'Physics Basics': ['Motion', 'Force', 'Energy', 'Light & Sound'],
          'Chemistry Basics': ['Elements', 'Compounds', 'Acids & Bases', 'Chemical Reactions'],
          'Biology Basics': ['Human Body', 'Diseases', 'Nutrition', 'Cell Biology'],
          'Science & Technology': ['ISRO', 'DRDO', 'Nuclear Energy', 'Space Technology'],
        },
      },
    },
  },
  // ─── HSST SUBJECTS ──────────────────────────────────────────────
  {
    name: 'HSST Commerce',
    description: 'Kerala PSC Higher Secondary School Teacher - Commerce',
    category: 'PSC',
    subjects: {
      'Commerce': {
        domains: {
          'Business Studies': ['Forms of Business', 'Business Services', 'Emerging Modes', 'Sources of Business Finance'],
          'Business Environment': ['Economic Systems', 'Liberalization', 'Globalization', 'WTO'],
          'Management Principles': ['Planning', 'Organizing', 'Staffing', 'Directing & Controlling'],
          'Marketing Management': ['Marketing Mix', 'Consumer Behaviour', 'Market Segmentation', 'Brand Management'],
          'Financial Markets': ['Money Market', 'Capital Market', 'Stock Exchange', 'SEBI'],
        },
      },
      'Accountancy': {
        domains: {
          'Financial Accounting': ['Journal Entries', 'Ledger', 'Trial Balance', 'Final Accounts'],
          'Company Accounts': ['Issue of Shares', 'Issue of Debentures', 'Redemption', 'Bonus Issue'],
          'Cost & Management Accounting': ['Cost Classification', 'Marginal Costing', 'Budgeting', 'Variance Analysis'],
          'Partnership Accounts': ['Admission', 'Retirement', 'Death', 'Dissolution'],
          'Ratio Analysis': ['Liquidity Ratios', 'Profitability Ratios', 'Solvency Ratios', 'Activity Ratios'],
        },
      },
      'Business Studies': {
        domains: {
          'Principles of Management': ['Fayol', 'Taylor', 'Weber', 'Modern Theories'],
          'Business Services': ['Banking', 'Insurance', 'Transportation', 'Warehousing'],
          'Sources of Business Finance': ['Equity', 'Debentures', 'Loans', 'Retained Earnings'],
          'Trade': ['Internal Trade', 'External Trade', 'EXIM Policy', 'E-Commerce'],
        },
      },
      'Economics': {
        domains: {
          'Microeconomics': ['Demand', 'Supply', 'Market Structures', 'Consumer Behaviour'],
          'Macroeconomics': ['National Income', 'Inflation', 'Unemployment', 'Fiscal Policy'],
          'Indian Economy': ['Planning', 'Agriculture', 'Industry', 'Services Sector'],
          'International Economics': ['Balance of Payments', 'Foreign Exchange', 'Trade Theory', 'WTO'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Economics',
    description: 'Kerala PSC Higher Secondary School Teacher - Economics',
    category: 'PSC',
    subjects: {
      'Microeconomics': {
        domains: {
          'Consumer Behaviour': ['Utility Analysis', 'Indifference Curve', 'Demand Analysis', 'Elasticity'],
          'Producer Behaviour': ['Production Function', 'Cost Analysis', 'Revenue', 'Profit Maximization'],
          'Market Structures': ['Perfect Competition', 'Monopoly', 'Monopolistic Competition', 'Oligopoly'],
          'Factor Pricing': ['Rent', 'Wages', 'Interest', 'Profit'],
        },
      },
      'Macroeconomics': {
        domains: {
          'National Income': ['GDP', 'GNP', 'NDP', 'Measurement Methods'],
          'Inflation': ['Types', 'Causes', 'Effects', 'Control Measures'],
          'Unemployment': ['Types', 'Causes', 'Effects', 'Employment Programmes'],
          'Fiscal Policy': ['Government Budget', 'Public Expenditure', 'Public Debt', 'Taxation'],
          'Monetary Policy': ['RBI Functions', 'Credit Control', 'Money Supply', 'Banking'],
        },
      },
      'Indian Economy': {
        domains: {
          'Economic Planning': ['Five Year Plans', 'NITI Aayog', 'Planning Commission', 'Objectives'],
          'Agriculture': ['Land Reforms', 'Green Revolution', 'Food Security', 'MSP'],
          'Industrial Policy': ['1956 Policy', '1991 Policy', 'Make in India', 'MSME'],
          'Services Sector': ['IT', 'Banking', 'Insurance', 'Tourism'],
          'Poverty & Development': ['Poverty Line', 'Human Development', 'SDGs', 'Inequality'],
        },
      },
      'Public Finance': {
        domains: {
          'Government Budget': ['Revenue', 'Expenditure', 'Deficit', 'Fiscal Responsibility'],
          'Taxation': ['Direct Tax', 'Indirect Tax', 'GST', 'Tax Reform'],
          'Public Debt': ['Internal Debt', 'External Debt', 'Debt Management', 'Debt Trap'],
          'International Finance': ['Exchange Rates', 'IMF', 'World Bank', 'Balance of Payments'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Economy News', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST History',
    description: 'Kerala PSC Higher Secondary School Teacher - History',
    category: 'PSC',
    subjects: {
      'Ancient India': {
        domains: {
          'Prehistoric Period': ['Stone Age', 'Mesolithic', 'Neolithic', 'Chalcolithic'],
          'Indus Valley': ['Town Planning', 'Economy', 'Script', 'Decline'],
          'Vedic Period': ['Early Vedic', 'Later Vedic', 'Society', 'Religion'],
          'Mauryan Empire': ['Chandragupta', 'Ashoka', 'Administration', 'Decline'],
          'Post Mauryan': ['Sunga', 'Kushan', 'Satavahana', 'Trade'],
          'Gupta Empire': ['Chandragupta I', 'Samudragupta', 'Kumaragupta', 'Cultural Achievements'],
        },
      },
      'Medieval India': {
        domains: {
          'Sultanate Period': ['Delhi Sultanate', 'Bahmani', 'Vijayanagara', 'Bhakti Movement'],
          'Mughal Empire': ['Babur', 'Akbar', 'Aurangzeb', 'Administration'],
          'Regional Kingdoms': ['Maratha', 'Sikh', 'Awadh', 'Mysore'],
          'Bhakti & Sufi': ['Sant Traditions', 'Sufi Orders', 'Literature', 'Impact'],
          'Ancient Kerala': ['Chera Dynasty', 'Sangam Age', 'Trade', 'Culture'],
        },
      },
      'Modern India': {
        domains: {
          'European Penetration': ['Portuguese', 'Dutch', 'French', 'British'],
          'British Rule': ['Plassey', 'Diwani', 'Revenue Systems', 'Administrative Changes'],
          'Freedom Struggle': ['1857 Revolt', 'Moderate Phase', 'Extremist Phase', 'Gandhian Phase'],
          'Social Reform': ['Raja Ram Mohan Roy', 'Jyotirao Phule', 'Periyar', 'Kerala Renaissance'],
          'Independence & After': ['Partition', 'Integration', 'Constitution', 'Nehruvian Era'],
        },
      },
      'World History': {
        domains: {
          'Ancient Civilizations': ['Mesopotamia', 'Egypt', 'Greece', 'Rome'],
          'Medieval World': ['Feudalism', 'Crusades', 'Renaissance', 'Reformation'],
          'Modern World': ['Industrial Revolution', 'French Revolution', 'World Wars', 'Cold War'],
          'Post-Cold War': ['Globalization', 'Regional Conflicts', 'UN Reform', 'World Economy'],
        },
      },
      'Kerala History': {
        domains: {
          'Ancient Kerala': ['Chera Dynasty', 'Sangam Literature', 'Trade Relations', 'Religion'],
          'Medieval Kerala': ['Kolathiri', 'Zamorin', 'Portuguese Arrival', 'Dutch & British'],
          'Colonial Period': ['Travancore', 'Cochin', 'Malabar', 'Social Reforms'],
          'Kerala Formation': ['State Formation', 'Languages', 'Political Movements', 'Renaissance'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Heritage & Culture', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Political Science',
    description: 'Kerala PSC Higher Secondary School Teacher - Political Science',
    category: 'PSC',
    subjects: {
      'Political Theory': {
        domains: {
          'Political Thought': ['Plato', 'Aristotle', 'Machiavelli', 'Hobbes'],
          'Modern Political Thought': ['Locke', 'Rousseau', 'Marx', 'Mill'],
          'Concepts': ['Liberty', 'Equality', 'Justice', 'Rights'],
          'Ideologies': ['Liberalism', 'Socialism', 'Communism', 'Feminism'],
        },
      },
      'Indian Government': {
        domains: {
          'Constitutional Framework': ['Making of Constitution', 'Preamble', 'Amendments', 'Basic Structure'],
          'Fundamental Rights': ['Right to Equality', 'Right to Freedom', 'Right against Exploitation', 'Right to Religion'],
          'Directive Principles': ['Socialistic', 'Gandhian', 'Liberal-Intellectual', 'Fundamental Duties'],
          'Parliament': ['Lok Sabha', 'Rajya Sabha', 'Legislative Process', 'Committees'],
          'Executive': ['President', 'Prime Minister', 'Council of Ministers', 'Governor'],
          'Judiciary': ['Supreme Court', 'High Court', 'Judicial Review', 'Public Interest Litigation'],
        },
      },
      'International Relations': {
        domains: {
          'IR Theories': ['Realism', 'Liberalism', 'Constructivism', 'Marxism'],
          'International Organizations': ['UN', 'WHO', 'WTO', 'World Bank'],
          'Indian Foreign Policy': ['Non-Alignment', 'SAARC', 'BRICS', 'Act East Policy'],
          'Global Issues': ['Climate Change', 'Terrorism', 'Nuclear Proliferation', 'Human Rights'],
        },
      },
      'Public Administration': {
        domains: {
          'Theories': ['Classical', 'Human Relations', 'Systems', 'Decision-Making'],
          'Indian Administration': ['Civil Services', 'District Administration', 'Panchayati Raj', 'Municipalities'],
          'Governance': ['E-Governance', 'Good Governance', 'Transparency', 'Accountability'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Political News', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Sociology',
    description: 'Kerala PSC Higher Secondary School Teacher - Sociology',
    category: 'PSC',
    subjects: {
      'Sociological Theory': {
        domains: {
          'Classical Theory': ['Marx', 'Durkheim', 'Weber', 'Simmel'],
          'Modern Theory': ['Structural Functionalism', 'Conflict Theory', 'Symbolic Interactionism', 'Feminism'],
          'Indian Thinkers': ['Ambedkar', 'Gandhi', 'Nehru', 'Mauss'],
        },
      },
      'Indian Society': {
        domains: {
          'Social Structure': ['Caste System', 'Tribes', 'Religion', 'Language'],
          'Social Change': ['Modernization', 'Secularization', 'Social Movements', 'Globalization'],
          'Social Institutions': ['Family', 'Marriage', 'Kinship', 'Education'],
          'Social Stratification': ['Class', 'Caste', 'Gender', 'Power'],
        },
      },
      'Social Issues': {
        domains: {
          'Poverty': ['Causes', 'Types', 'Measurement', 'Poverty Alleviation Programmes'],
          'Unemployment': ['Types', 'Causes', 'Government Programmes', 'Skill Development'],
          'Communalism': ['Communal Tension', 'Secularism', 'Communal Violence', 'Integration'],
          'Gender Issues': ['Patriarchy', 'Women Empowerment', 'Domestic Violence', 'Gender Budgeting'],
          'Environmental Issues': ['Population', 'Pollution', 'Climate Change', 'Sustainable Development'],
        },
      },
      'Research Methods': {
        domains: {
          'Research Methodology': ['Research Design', 'Sampling', 'Data Collection', 'Data Analysis'],
          'Quantitative Methods': ['Survey', 'Experiment', 'Statistical Analysis', 'Hypothesis Testing'],
          'Qualitative Methods': ['Interview', 'Focus Group', 'Ethnography', 'Case Study'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Social Issues', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Philosophy',
    description: 'Kerala PSC Higher Secondary School Teacher - Philosophy',
    category: 'PSC',
    subjects: {
      'Indian Philosophy': {
        domains: {
          'Vedic Philosophy': ['Rigveda', 'Upanishads', 'Brahman', 'Atman'],
          'Orthodox Systems': ['Nyaya', 'Vaisheshika', 'Samkhya', 'Yoga'],
          'Heterodox Systems': ['Buddhism', 'Jainism', 'Charvaka', 'Ajivika'],
          'Modern Indian Philosophy': ['Vivekananda', 'Aurobindo', 'Radhakrishnan', 'Gandhi'],
        },
      },
      'Western Philosophy': {
        domains: {
          'Ancient Greek': ['Socrates', 'Plato', 'Aristotle', 'Stoics'],
          'Modern Philosophy': ['Descartes', 'Locke', 'Hume', 'Kant'],
          '19th Century': ['Hegel', 'Schopenhauer', 'Nietzsche', 'Marx'],
          '20th Century': ['Existentialism', 'Pragmatism', 'Analytic Philosophy', 'Postmodernism'],
        },
      },
      'Ethics': {
        domains: {
          'Normative Ethics': ['Utilitarianism', 'Deontology', 'Virtue Ethics', 'Care Ethics'],
          'Applied Ethics': ['Environmental Ethics', 'Bioethics', 'Business Ethics', 'Media Ethics'],
          'Meta Ethics': ['Moral Realism', 'Emotivism', 'Cognitivism', 'Moral Relativism'],
          'Indian Ethics': ['Dharma', 'Karma', 'Ahimsa', 'Satyagraha'],
        },
      },
      'Logic': {
        domains: {
          'Formal Logic': ['Propositional Logic', 'Predicate Logic', 'Validity', 'Soundness'],
          'Informal Logic': ['Fallacies', 'Argument Analysis', 'Critical Thinking', 'Debate'],
          'Indian Logic': ['Nyaya Logic', 'Pratyaksha', 'Anumana', 'Sabda'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Geography',
    description: 'Kerala PSC Higher Secondary School Teacher - Geography',
    category: 'PSC',
    subjects: {
      'Physical Geography': {
        domains: {
          'Geomorphology': ['Rock Types', 'Weathering', 'Erosion', 'Landforms'],
          'Climatology': ['Atmosphere', 'Climate Classification', 'Monsoon', 'Climate Change'],
          'Oceanography': ['Ocean Currents', 'Tides', 'Sea Floor', 'Marine Resources'],
          'Biogeography': ['Biomes', 'Biomes Distribution', 'Ecological Succession', 'Biogeographical Zones'],
        },
      },
      'Human Geography': {
        domains: {
          'Population': ['Growth', 'Distribution', 'Migration', 'Demographic Transition'],
          'Settlement': ['Rural', 'Urban', 'Urbanization', 'Smart Cities'],
          'Economic Geography': ['Agriculture', 'Industry', 'Services', 'Trade'],
          'Cultural Geography': ['Language', 'Religion', 'Ethnicity', 'Cultural Regions'],
        },
      },
      'Indian Geography': {
        domains: {
          'Physical Features': ['Mountains', 'Plateaus', 'Plains', 'Coastal Areas'],
          'Drainage': ['Himalayan Rivers', 'Peninsular Rivers', 'Lakes', 'River Basins'],
          'Climate & Vegetation': ['Climate Zones', 'Forest Types', 'Soil Types', 'Natural Vegetation'],
          'Resources': ['Minerals', 'Energy', 'Water', 'Land Resources'],
        },
      },
      'Cartography': {
        domains: {
          'Map Basics': ['Scale', 'Projection', 'Conventional Symbols', 'Map Reading'],
          'Remote Sensing': ['Satellite Imagery', 'GIS', 'GPS', 'Applications'],
          'Thematic Maps': ['Climate Map', 'Soil Map', 'Population Map', 'Economic Map'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Environment News', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Botany',
    description: 'Kerala PSC Higher Secondary School Teacher - Botany',
    category: 'PSC',
    subjects: {
      'Plant Biology': {
        domains: {
          'Cell Biology': ['Cell Structure', 'Cell Division', 'Cell Organelles', 'Cell Membrane'],
          'Plant Anatomy': ['Tissues', 'Root Anatomy', 'Stem Anatomy', 'Leaf Anatomy'],
          'Plant Physiology': ['Photosynthesis', 'Respiration', 'Transpiration', 'Growth Regulators'],
          'Reproduction': ['Sexual Reproduction', 'Asexual Reproduction', 'Pollination', 'Fertilization'],
        },
      },
      'Taxonomy': {
        domains: {
          'Classification Systems': ['APG', 'Bentham & Hooker', 'Engler & Prantl', 'Takhtajan'],
          'Angiosperm Families': ['Fabaceae', 'Solanaceae', 'Asteraceae', 'Poaceae'],
          'Systematics': ['Nomenclature', 'Morphology', 'Phylogeny', 'Diversity'],
        },
      },
      'Ecology': {
        domains: {
          'Ecosystem': ['Energy Flow', 'Nutrient Cycling', 'Ecological Succession', 'Food Web'],
          'Biodiversity': ['Hotspots', 'Endangered Species', 'Conservation', 'Biodiversity India'],
          'Environmental Issues': ['Pollution', 'Deforestation', 'Climate Change', 'Ozone Depletion'],
        },
      },
      'Genetics': {
        domains: {
          'Mendelian Genetics': ['Law of Segregation', 'Law of Independent Assortment', 'Dihybrid Cross', 'Linkage'],
          'Molecular Genetics': ['DNA Replication', 'Transcription', 'Translation', 'Gene Regulation'],
          'Biotechnology': ['Recombinant DNA', 'PCR', 'Gene Therapy', 'Transgenic Plants'],
        },
      },
      'Plant Pathology': {
        domains: {
          'Diseases': ['Fungal Diseases', 'Bacterial Diseases', 'Viral Diseases', 'Nematode Diseases'],
          'Plant Protection': ['Fungicides', 'Biocontrol', 'Integrated Disease Management', 'Quarantine'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Science & Tech', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Zoology',
    description: 'Kerala PSC Higher Secondary School Teacher - Zoology',
    category: 'PSC',
    subjects: {
      'Animal Biology': {
        domains: {
          'Cell Biology': ['Cell Structure', 'Cell Division', 'Cell Organelles', 'Cell Membrane'],
          'Histology': ['Tissues', 'Epithelial Tissue', 'Connective Tissue', 'Muscle Tissue'],
          'Embryology': ['Fertilization', 'Cleavage', 'Gastrulation', 'Organogenesis'],
          'Animal Physiology': ['Digestion', 'Circulation', 'Excretion', 'Nervous System'],
        },
      },
      'Taxonomy': {
        domains: {
          'Classification': ['Porifera', 'Cnidaria', 'Platyhelminthes', 'Nematoda'],
          'Vertebrate Classification': ['Pisces', 'Amphibia', 'Reptilia', 'Aves & Mammalia'],
          'Systematics': ['Nomenclature', 'Morphology', 'Phylogeny', 'Diversity'],
        },
      },
      'Ecology': {
        domains: {
          'Ecosystem': ['Energy Flow', 'Nutrient Cycling', 'Ecological Succession', 'Food Web'],
          'Biodiversity': ['Hotspots', 'Endangered Species', 'Conservation', 'Biodiversity India'],
          'Environmental Issues': ['Pollution', 'Deforestation', 'Climate Change', 'Ozone Depletion'],
          'Wildlife': ['Wildlife of India', 'Wildlife of Kerala', 'Protected Areas', 'Conservation Strategies'],
        },
      },
      'Genetics': {
        domains: {
          'Mendelian Genetics': ['Law of Segregation', 'Law of Independent Assortment', 'Dihybrid Cross', 'Linkage'],
          'Molecular Genetics': ['DNA Replication', 'Transcription', 'Translation', 'Gene Regulation'],
          'Biotechnology': ['Recombinant DNA', 'PCR', 'Gene Therapy', 'Transgenic Animals'],
        },
      },
      'Physiology': {
        domains: {
          'Human Physiology': ['Digestive System', 'Circulatory System', 'Nervous System', 'Endocrine System'],
          'Animal Adaptation': ['Desert Adaptation', 'Aquatic Adaptation', 'Arctic Adaptation', 'Aerial Adaptation'],
          'Parasitology': ['Protozoa', 'Helminths', 'Ectoparasites', 'Life Cycles'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Science & Tech', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Physics',
    description: 'Kerala PSC Higher Secondary School Teacher - Physics',
    category: 'PSC',
    subjects: {
      'Mechanics': {
        domains: {
          'Kinematics': ['Distance & Displacement', 'Velocity & Acceleration', 'Projectile Motion', 'Relative Motion'],
          'Laws of Motion': ['Newton Laws', 'Friction', 'Circular Motion', 'Centripetal Force'],
          'Work & Energy': ['Work', 'Kinetic Energy', 'Potential Energy', 'Conservation of Energy'],
          'Rotational Motion': ['Moment of Inertia', 'Torque', 'Angular Momentum', 'Rolling Motion'],
          'Gravitation': ['Newton Law', 'Orbital Velocity', 'Escape Velocity', 'Kepler Laws'],
        },
      },
      'Thermodynamics': {
        domains: {
          'Laws of Thermodynamics': ['Zeroth Law', 'First Law', 'Second Law', 'Third Law'],
          'Kinetic Theory': ['Ideal Gas', 'Mean Free Path', 'Degrees of Freedom', 'Specific Heat'],
          'Heat Transfer': ['Conduction', 'Convection', 'Radiation', 'Black Body Radiation'],
        },
      },
      'Optics': {
        domains: {
          'Ray Optics': ['Reflection', 'Refraction', 'Prism', 'Optical Instruments'],
          'Wave Optics': ['Interference', 'Diffraction', 'Polarization', 'Young Double Slit'],
          'Nature of Light': ['Theories', 'EM Spectrum', 'Fizeau Experiment', 'Michelson-Morley'],
        },
      },
      'Electronics': {
        domains: {
          'Semiconductor Physics': ['PN Junction', 'Diode', 'Transistor', 'Logic Gates'],
          'Digital Electronics': ['Boolean Algebra', 'Flip Flops', 'Counters', 'Registers'],
          'Communication Systems': ['Modulation', 'Demodulation', 'Antenna', 'Bandwidth'],
        },
      },
      'Modern Physics': {
        domains: {
          'Quantum Physics': ['Photoelectric Effect', 'de Broglie', 'Heisenberg', 'Schrödinger'],
          'Nuclear Physics': ['Nuclear Structure', 'Radioactivity', 'Nuclear Fission', 'Nuclear Fusion'],
          'Relativity': ['Special Relativity', 'Time Dilation', 'Length Contraction', 'Mass-Energy'],
          'Atomic Physics': ['Bohr Model', 'Hydrogen Spectrum', 'X-Rays', 'Lasers'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Science & Tech', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Chemistry',
    description: 'Kerala PSC Higher Secondary School Teacher - Chemistry',
    category: 'PSC',
    subjects: {
      'Physical Chemistry': {
        domains: {
          'Atomic Structure': ['Bohr Model', 'Quantum Numbers', 'Electronic Configuration', 'Periodic Properties'],
          'Chemical Bonding': ['Ionic Bond', 'Covalent Bond', 'VSEPR Theory', 'Hybridization'],
          'Chemical Kinetics': ['Rate of Reaction', 'Activation Energy', 'Catalysis', 'Order of Reaction'],
          'Thermochemistry': ['Enthalpy', 'Hess Law', 'Entropy', 'Gibbs Energy'],
          'Equilibrium': ['Chemical Equilibrium', 'Ionic Equilibrium', 'pH', 'Buffer Solutions'],
          'Electrochemistry': ['Nernst Equation', 'Galvanic Cell', 'Electrolysis', 'Conductance'],
        },
      },
      'Inorganic Chemistry': {
        domains: {
          's-Block Elements': ['Alkali Metals', 'Alkaline Earth Metals', 'Diagonal Relationship', 'Compounds'],
          'p-Block Elements': ['Group 13', 'Group 14', 'Group 15', 'Group 16'],
          'd-Block Elements': ['Transition Metals', 'Lanthanides', 'Actinides', 'Coordination Compounds'],
          'Metallurgy': ['Extraction', 'Refining', 'Thermodynamic Principles', 'Specific Metals'],
          'Qualitative Analysis': ['Cation Analysis', 'Anion Analysis', 'Flame Tests', 'Borax Bead Test'],
        },
      },
      'Organic Chemistry': {
        domains: {
          'Hydrocarbons': ['Alkanes', 'Alkenes', 'Alkynes', 'Aromatic Hydrocarbons'],
          'Functional Groups': ['Haloalkanes', 'Alcohols', 'Aldehydes & Ketones', 'Carboxylic Acids'],
          'Reactions': ['Substitution', 'Addition', 'Elimination', 'Condensation'],
          'Stereochemistry': ['Isomerism', 'Optical Isomerism', 'Conformation', 'R-S Configuration'],
          'Polymers': ['Addition Polymers', 'Condensation Polymers', 'Natural Polymers', 'Biodegradable'],
          'Biomolecules': ['Carbohydrates', 'Proteins', 'Nucleic Acids', 'Lipids'],
        },
      },
      'Analytical Chemistry': {
        domains: {
          'Volumetric Analysis': ['Acid-Base Titration', 'Redox Titration', 'Complexometric', 'Precipitation'],
          'Instrumental Methods': ['UV-Vis Spectroscopy', 'IR Spectroscopy', 'NMR', 'Mass Spectrometry'],
          'Chromatography': ['TLC', 'Column Chromatography', 'HPLC', 'GC'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Science & Tech', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Mathematics',
    description: 'Kerala PSC Higher Secondary School Teacher - Mathematics',
    category: 'PSC',
    subjects: {
      'Algebra': {
        domains: {
          'Sets & Relations': ['Set Operations', 'Relations', 'Functions', 'Types of Functions'],
          'Complex Numbers': ['Complex Algebra', 'Argand Plane', 'Polar Form', 'De Moivre Theorem'],
          'Quadratic Equations': ['Nature of Roots', 'Vieta Formula', 'Quadratic Inequalities', 'Location of Roots'],
          'Sequences & Series': ['AP', 'GP', 'HP', 'Sigma Notation'],
          'Matrices': ['Types', 'Operations', 'Inverse', 'Rank'],
          'Determinants': ['Properties', 'Cramer Rule', 'Adjoint', 'Singular & Non-Singular'],
        },
      },
      'Calculus': {
        domains: {
          'Limits': ['Standard Limits', 'L-Hopital Rule', 'Sandwich Theorem', 'Infinite Limits'],
          'Continuity & Differentiability': ['Types of Discontinuity', 'Chain Rule', 'Implicit Differentiation', 'Parametric'],
          'Applications of Derivatives': ['Tangent & Normal', 'Maxima & Minima', 'Rolle Theorem', 'LMVT'],
          'Integration': ['Indefinite Integral', 'Definite Integral', 'Properties', 'Reduction Formulas'],
          'Differential Equations': ['Order & Degree', 'Variable Separable', 'Homogeneous', 'Linear DE'],
        },
      },
      'Coordinate Geometry': {
        domains: {
          'Straight Lines': ['Slope', 'Equations of Line', 'Angle Between Lines', 'Distance'],
          'Circles': ['General Equation', 'Tangent & Normal', 'Radical Axis', 'Family of Circles'],
          'Conics': ['Parabola', 'Ellipse', 'Hyperbola', 'Tangents & Normals'],
          '3D Geometry': ['Direction Cosines', 'Line', 'Plane', 'Sphere'],
        },
      },
      'Statistics & Probability': {
        domains: {
          'Statistics': ['Mean', 'Median', 'Mode', 'Standard Deviation'],
          'Probability': ['Classical', 'Conditional', 'Bayes Theorem', 'Random Variables'],
          'Distributions': ['Binomial', 'Poisson', 'Normal', 'Sampling'],
          'Regression & Correlation': ['Regression Lines', 'Correlation Coefficient', 'Rank Correlation', 'Curve Fitting'],
        },
      },
      'Numerical Methods': {
        domains: {
          'Interpolation': ['Forward', 'Backward', 'Central', 'Lagrange'],
          'Numerical Differentiation': ['Forward', 'Backward', 'Central', 'Error'],
          'Numerical Integration': ['Trapezoidal', 'Simpson Rule', 'Weddle Rule', 'Gaussian Quadrature'],
          'Numerical Solutions': ['Bisection', 'Newton-Raphson', 'Gauss Elimination', 'Iterative Methods'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Science & Tech', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Malayalam',
    description: 'Kerala PSC Higher Secondary School Teacher - Malayalam',
    category: 'PSC',
    subjects: {
      'Malayalam Sahitya': {
        domains: {
          'Ancient Literature': ['Sangam Literature', 'Pattu', 'Mangalam', 'Champu'],
          'Medieval Literature': ['Skekzhill', 'Mappila Pattu', 'Kathakali', 'Thullal'],
          'Modern Literature': ['Kumaran Asan', 'Vallathol', 'Ulloor', 'Changampuzha'],
          'Contemporary Literature': ['O.V. Vijayan', 'M.T. Vasudevan Nair', 'Sugathakumari', 'Punathil Kunjabdulla'],
          'Prose': ['Novel', 'Short Story', 'Essay', 'Biography'],
        },
      },
      'Grammar': {
        domains: {
          'Sandhi': ['Swarasandhi', 'Vyanjanasandhi', 'Visamasandhi', 'Samasandhi'],
          'Samasa': ['Tatpurusha', 'Dvandva', 'Bahuvrihi', 'Avyayibhava'],
          'Vakyashuddhi': ['Pada', 'Vakya', 'Purvakalpam', 'Uttarakalpam'],
          'Vyakaranam': ['Nanavakya', 'Samasavakya', 'Sadvakya', 'Chillaravakya'],
          'Padyam': ['Kilippattu', 'Vanchipattu', 'Mangalapattu', 'Pāththu'],
        },
      },
      'Literary Criticism': {
        domains: {
          'Indian Criticism': ['Bharata', 'Dandin', 'Anandavardhana', 'Mammata'],
          'Western Criticism': ['Plato', 'Aristotle', 'Longinus', 'Boileau'],
          'Modern Criticism': ['Formalism', 'Structuralism', 'Postmodernism', 'Feminist Criticism'],
        },
      },
      'Translation': {
        domains: {
          'Translation Theory': ['Equivalence', 'Fidelity', 'Creativity', 'Cultural Transfer'],
          'Translation Practice': ['Literary Translation', 'Technical Translation', 'Official Translation', 'Media Translation'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST English',
    description: 'Kerala PSC Higher Secondary School Teacher - English',
    category: 'PSC',
    subjects: {
      'English Literature': {
        domains: {
          'Chaucer to Elizabethan': ['Chaucer', 'Spenser', 'Shakespeare', 'Milton'],
          'Restoration to Romantic': ['Dryden', 'Pope', 'Wordsworth', 'Shelley'],
          'Victorian to Modern': ['Tennyson', 'Arnold', 'Eliot', 'Yeats'],
          'American Literature': ['Poe', 'Twain', 'Frost', 'Hemingway'],
          'Indian Writing in English': ['Tagore', 'Narayan', 'Rushdie', 'Roy'],
        },
      },
      'Grammar': {
        domains: {
          'Parts of Speech': ['Noun', 'Pronoun', 'Verb', 'Adjective'],
          'Tenses': ['Present', 'Past', 'Future', 'Perfect'],
          'Articles & Prepositions': ['A/An/The', 'Prepositions', 'Conjunctions', 'Interjections'],
          'Voice & Narration': ['Active/Passive', 'Direct/Indirect', 'Reported Speech', 'Question Tags'],
          'Sentence Structure': ['Simple', 'Compound', 'Complex', 'Sentence Correction'],
        },
      },
      'Linguistics': {
        domains: {
          'Phonetics': ['Vowels', 'Consonants', 'IPA', 'Intonation'],
          'Morphology': ['Morphemes', 'Word Formation', 'Derivation', 'Inflection'],
          'Syntax': ['Phrase Structure', 'Transformational Grammar', 'Parse Trees', 'Movement'],
          'Semantics': ['Meaning', 'Antonymy', 'Synonymy', 'Hyponymy'],
        },
      },
      'ELT': {
        domains: {
          'Methods & Approaches': ['Grammar-Translation', 'Direct Method', 'CLT', 'Task-Based'],
          'Language Skills': ['Reading', 'Writing', 'Listening', 'Speaking'],
          'Assessment': ['Formative', 'Summative', 'Continuous', 'Rubric-Based'],
          'Materials Development': ['Textbook Design', 'Course Design', 'Lesson Planning', 'Aids & Materials'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Education News', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Hindi',
    description: 'Kerala PSC Higher Secondary School Teacher - Hindi',
    category: 'PSC',
    subjects: {
      'Hindi Sahitya': {
        domains: {
          'Adikalin': ['Tulsidas', 'Surdas', 'Kabir', 'Bhakti Kavya'],
          'Dadkalin': ['Bharatendu', 'Mahavir Prasad Dwivedi', 'Premchand', 'Jainendra'],
          'Adhunik Kal': ['Mahadevi Varma', 'Harivansh Rai Bachchan', 'Suryakant Tripathi', 'Ramdhari Singh Dinkar'],
          'Samkalin': ['Nirmal Verma', 'Krishan Chander', 'Mohan Rakesh', 'Usha Priyamvada'],
          'Gadya': ['Kahani', 'Upanyas', 'Nibandh', 'Aatmkatha'],
        },
      },
      'Vyakaran': {
        domains: {
          'Shabd Vigyan': ['Noun', 'Pronoun', 'Verb', 'Adjective'],
          'Sandhi': ['Swar Sandhi', 'Vyanjan Sandhi', 'Visarji Sandhi', 'Lop Sandhi'],
          'Samas': ['Tatpurush', 'Karmadharay', 'Dvandva', 'Bahuvrihi'],
          'Vakya Rachna': ['Mukhya Vakya', 'Sahayak Vakya', 'Visheshan', 'Kriya'],
          'Ras & Chhand': ['Shringar Ras', 'Veer Ras', 'Karun Ras', 'Bhav Geet'],
        },
      },
      'Hindi Padhyagranth': {
        domains: {
          'Kavya': ['Ramcharitmanas', 'Kavitavali', 'Vinay Patrika', 'Geet Govind'],
          'Gadya': ['Godan', 'Nirmala', 'Rangbhoomi', 'Maila Anchal'],
          'Natak': ['Adhe Adhure', 'Tughlaq', 'Ashwatthama', 'Andha Yug'],
          'Nibandh': ['Vivekanand', 'Gandhi', 'Nehru', 'Subhash'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Hindi Sahitya Awards', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Arabic',
    description: 'Kerala PSC Higher Secondary School Teacher - Arabic',
    category: 'PSC',
    subjects: {
      'Arabic Literature': {
        domains: {
          'Pre-Islamic': ['Qasida', 'Mu\'allaqat', 'Ghazal', 'Kaifiyat'],
          'Islamic Period': ['Quran', 'Hadith', 'Qisas', 'Maqamat'],
          'Modern Arabic': ['Nahda', 'Modern Poetry', 'Modern Novel', 'Short Story'],
          'Kerala Arabic': ['Malayalam Arabic', 'Mappila Literature', 'Arabic-Malayalam', 'Traditional Works'],
        },
      },
      'Grammar': {
        domains: {
          'Sarf': ['Ism', 'Fi\'l', 'Harf', 'Mushabbah'],
          'Nahw': ['Jumla', 'Ismiya', 'Fi\'liya', 'Harfiya'],
          'I\'rab': ['Marfu\'', 'Mansub', 'Majrur', 'Examples'],
          'Balagha': ['Bayan', 'Ma\'ani', 'Badi', 'Tafsir'],
        },
      },
      'Translation': {
        domains: {
          'Arabic to Malayalam': ['Prose', 'Poetry', 'Technical', 'Religious'],
          'Malayalam to Arabic': ['Prose', 'Poetry', 'Media', 'Academic'],
          'Translation Theory': ['Equivalence', 'Fidelity', 'Cultural Adaptation', 'Terminology'],
        },
      },
      'Islamic Studies': {
        domains: {
          'Quran Studies': ['Tajweed', 'Tafsir', 'Quranic Arabic', 'Themes'],
          'Hadith Studies': ['Six Books', 'Classification', 'Study Methods', 'Authentication'],
          'Islamic History': ['Prophet', 'Rashidun', 'Umayyad', 'Abbasid'],
          'Islamic Jurisprudence': ['Fiqh', 'Usul al-Fiqh', 'Madhabs', 'Fatwa'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Arab World', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Sanskrit',
    description: 'Kerala PSC Higher Secondary School Teacher - Sanskrit',
    category: 'PSC',
    subjects: {
      'Sanskrit Literature': {
        domains: {
          'Vedic Literature': ['Rigveda', 'Samaveda', 'Yajurveda', 'Atharvaveda'],
          'Classical Poetry': ['Kalidasa', 'Bhavabhuti', 'Magha', 'Sriharsha'],
          'Epic Poetry': ['Ramayana', 'Mahabharata', 'Bhagavata', 'Kiratarjuniya'],
          'Drama': ['Abhijnanasakuntalam', 'Mricchakatika', 'Mattavilasa', 'Kalidasa Natakas'],
          'Prose': ['Panchatantra', 'Hitopadesha', 'Kathasaritsagara', 'Vetala Panchavimshati'],
        },
      },
      'Vyakaran': {
        domains: {
          'Shabd Vigyan': ['Nama', 'Akaranta', 'Dirghanta', 'Vyanjanant'],
          'Sandhi': ['Svar Sandhi', 'Vyanjan Sandhi', 'Visarji Sandhi', 'Yan Sandhi'],
          'Samasa': ['Tatpurusha', 'Karmadharaya', 'Dvandva', 'Bahuvrihi'],
          'Vakya': ['Pratyaya', 'Pada', 'Vakya Prakriti', 'Lakara'],
          'Dhatu': ['Dhatu Patha', 'Gana', 'Karak', 'Shatavari'],
        },
      },
      'Darshana': {
        domains: {
          'Nyaya': ['Pramana', 'Padartha', 'Hetvabhasa', 'Anumana'],
          'Vaisheshika': ['Dravya', 'Guna', 'Karma', 'Samanya'],
          'Sankhya': ['Prakriti', 'Purusha', 'Tattva', 'Kaivalya'],
          'Yoga': ['Ashtanga Yoga', 'Yama', 'Niyama', 'Samadhi'],
          'Vedanta': ['Advaita', 'Vishishtadvaita', 'Dvaita', 'Maya'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Sanskrit Studies', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
  {
    name: 'HSST Home Science',
    description: 'Kerala PSC Higher Secondary School Teacher - Home Science',
    category: 'PSC',
    subjects: {
      'Food and Nutrition': {
        domains: {
          'Nutrition Science': ['Macronutrients', 'Micronutrients', 'Energy Metabolism', 'Digestion & Absorption'],
          'Therapeutic Nutrition': ['Diabetes Diet', 'Hypertension Diet', 'Renal Diet', 'Cardiac Diet'],
          'Food Science': ['Food Chemistry', 'Food Microbiology', 'Food Processing', 'Food Preservation'],
          'Community Nutrition': ['Malnutrition', 'Nutrition Programmes', 'ICDS', 'Poshan Abhiyan'],
        },
      },
      'Human Development': {
        domains: {
          'Child Development': ['Physical Development', 'Cognitive Development', 'Social Development', 'Language Development'],
          'Adolescent Development': ['Puberty', 'Identity', 'Peer Relations', 'Career Planning'],
          'Adult Development': ['Marriage', 'Parenthood', 'Aging', 'Retirement'],
          'Developmental Theories': ['Piaget', 'Erikson', 'Vygotsky', 'Freud'],
        },
      },
      'Textiles': {
        domains: {
          'Fibre Science': ['Natural Fibres', 'Synthetic Fibres', 'Fibre Properties', 'Testing'],
          'Fabric Construction': ['Weaving', 'Knitting', 'Non-Woven', 'Finishing'],
          'Textile Care': ['Washing', 'Stain Removal', 'Ironing', 'Storage'],
          'Fashion Designing': ['Pattern Making', 'Draping', 'Garment Construction', 'Fashion Trends'],
        },
      },
      'Extension Education': {
        domains: {
          'Extension Methods': ['Teaching Methods', 'Audio-Visual Aids', 'Demonstration', 'Field Visit'],
          'Rural Development': ['SHG', 'MGNREGA', 'IRDP', 'Panchayat Raj'],
          'Women Empowerment': ['Legal Rights', 'Economic Empowerment', 'Education', 'Health'],
          'Community Development': ['Participation', 'Planning', 'Implementation', 'Evaluation'],
        },
      },
      'General Knowledge': {
        domains: {
          'Indian History': ['Ancient India', 'Medieval India', 'Modern India', 'Freedom Struggle'],
          'Indian Constitution': ['Fundamental Rights', 'Directive Principles', 'Parliament', 'Judiciary'],
          'Current Affairs': ['National', 'International', 'Kerala State', 'Awards & Honours'],
          'Kerala History & Culture': ['Ancient Kerala', 'Kerala Renaissance', 'Art Forms', 'Festivals'],
        },
      },
    },
  },
];

// ─── MAIN ────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nStarting creation of ${exams.length} Kerala PSC exams...\n`);

  // Find the next available TaxonomyNode ID
  const maxNode = await prisma.taxonomyNode.findFirst({
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  let nextNodeId = (maxNode?.id || 0) + 1;
  console.log(`Current max TaxonomyNode ID: ${maxNode?.id || 0}, starting from ${nextNodeId}\n`);

  let examCount = 0;
  let subjectCount = 0;
  let domainCount = 0;
  let topicCount = 0;
  let conceptCount = 0;

  for (const examDef of exams) {
    // Check if exam already exists
    const existing = await prisma.exam.findFirst({ where: { name: examDef.name } });
    if (existing) {
      console.log(`⚠️  ${examDef.name} already exists (id: ${existing.id}), skipping...`);
      continue;
    }

    // Create Exam record
    const exam = await prisma.exam.create({
      data: {
        name: examDef.name,
        description: examDef.description,
        category: examDef.category,
      },
    });
    console.log(`\n📋 Created exam: ${exam.name} (id: ${exam.id})`);
    examCount++;

    let examSubjectCount = 0;

    // Create Subjects
    for (const [subjectName, subjectData] of Object.entries(examDef.subjects)) {
      let subDomainCount = 0;
      let subTopicCount = 0;
      let subConceptCount = 0;

      // Create Subject record
      const subject = await prisma.subject.create({
        data: {
          name: subjectName,
          examId: exam.id,
          order: examSubjectCount,
        },
      });
      examSubjectCount++;

      // Create TaxonomyNode for SUBJECT (parentId = ROOT_ID)
      const subjectSlug = slugify(`${examDef.name}-${subjectName}-${nextNodeId}`);
      const subjectNode = await prisma.taxonomyNode.create({
        data: {
          id: nextNodeId,
          parentId: ROOT_ID,
          level: 'SUBJECT',
          nameEnglish: subjectName,
          nameMalayalam: subjectName,
          slug: subjectSlug,
          status: 'approved',
          importance: 'medium',
          difficulty: 'beginner',
          tags: [examDef.name, subjectName],
          aliases: [],
        },
      });
      nextNodeId++;

      // Create Domains
      for (const [domainName, topics] of Object.entries(subjectData.domains)) {
        // Create TaxonomyNode for DOMAIN (parentId = subject node id)
        const domainSlug = slugify(`${examDef.name}-${domainName}-${nextNodeId}`);
        const domainNode = await prisma.taxonomyNode.create({
          data: {
            id: nextNodeId,
            parentId: subjectNode.id,
            level: 'DOMAIN',
            nameEnglish: domainName,
            nameMalayalam: domainName,
            slug: domainSlug,
            status: 'approved',
            importance: 'medium',
            difficulty: 'beginner',
            tags: [examDef.name, subjectName, domainName],
            aliases: [],
          },
        });
        nextNodeId++;
        subDomainCount++;

        // Create Topics
        for (const topicName of topics) {
          // Create TaxonomyNode for TOPIC (parentId = domain node id)
          const topicSlug = slugify(`${examDef.name}-${topicName}-${nextNodeId}`);
          const topicNode = await prisma.taxonomyNode.create({
            data: {
              id: nextNodeId,
              parentId: domainNode.id,
              level: 'TOPIC',
              nameEnglish: topicName,
              nameMalayalam: topicName,
              slug: topicSlug,
              status: 'approved',
              importance: 'medium',
              difficulty: 'beginner',
              tags: [examDef.name, subjectName, domainName, topicName],
              aliases: [],
            },
          });
          nextNodeId++;
          subTopicCount++;

          // Create Concept nodes for each topic
          for (const template of CONCEPT_TEMPLATES) {
            const conceptName = template(topicName);
            const conceptSlug = slugify(`${examDef.name}-${conceptName}-${nextNodeId}`);
            const conceptNode = await prisma.taxonomyNode.create({
              data: {
                id: nextNodeId,
                parentId: topicNode.id,
                level: 'CONCEPT',
                nameEnglish: conceptName,
                nameMalayalam: conceptName,
                slug: conceptSlug,
                status: 'approved',
                importance: 'medium',
                difficulty: 'beginner',
                tags: [examDef.name, subjectName, domainName, topicName],
                aliases: [],
              },
            });
            nextNodeId++;
            subConceptCount++;
          }
        }
      }

      domainCount += subDomainCount;
      topicCount += subTopicCount;
      conceptCount += subConceptCount;
      console.log(`  📚 ${subjectName}: ${subDomainCount} domains, ${subTopicCount} topics, ${subConceptCount} concepts`);
    }

    subjectCount += examSubjectCount;

    console.log(`  ✅ ${exam.name}: ${examSubjectCount} subjects created`);
  }

  // Final Summary
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  CREATION SUMMARY');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Exams created:     ${examCount}`);
  console.log(`  Subjects created:  ${subjectCount}`);
  console.log(`  Domains created:   ${domainCount}`);
  console.log(`  Topics created:    ${topicCount}`);
  console.log(`  Concepts created:  ${conceptCount}`);
  console.log(`  Total TaxonomyNodes: ${subjectCount + domainCount + topicCount + conceptCount}`);
  console.log(`  Next available ID: ${nextNodeId}`);
  console.log('══════════════════════════════════════════════════════\n');

  // Verify
  const totalNodes = await prisma.taxonomyNode.count();
  const totalExams = await prisma.exam.count();
  const totalSubjects = await prisma.subject.count();
  console.log(`Database totals: ${totalExams} exams, ${totalSubjects} subjects, ${totalNodes} taxonomy nodes\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
