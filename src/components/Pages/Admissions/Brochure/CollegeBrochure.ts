import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Icon } from '../../../Shared/Icon';
import { AdmissionsContext } from '../admissions.store';

interface CourseInfo {
  id: string;
  name: string;
  degree: string;
  category: 'cs' | 'core' | 'pg';
  duration: string;
  intake: number;
  dteCode: string;
  highlights: string[];
  labs: string[];
  careers: string[];
  eligibility: string;
}

const COURSES: readonly CourseInfo[] = [
  {
    id: 'cse',
    name: 'Computer Science & Engineering',
    degree: 'B.Tech (CSE)',
    category: 'cs',
    duration: '4 Years (8 Semesters)',
    intake: 180,
    dteCode: '417724210',
    highlights: [
      'Full-Stack Cloud & Web Engineering',
      'Advanced Data Structures & Algorithms',
      'Open-Source Technologies & DevOps',
      'Industry Projects with Tech Giants',
    ],
    labs: [
      'Advanced Computing & GPU Lab',
      'Cloud Architecture & Linux Center',
      'Software Engineering & Project Studio',
    ],
    careers: [
      'Software Development Engineer (SDE)',
      'Full-Stack Cloud Engineer',
      'System Architect & DevOps Specialist',
    ],
    eligibility: 'Passed 10+2 / HSC with Physics & Mathematics + Chemistry/CS/IT (min 45% aggregate) with valid MHT-CET or JEE (Main) score.',
  },
  {
    id: 'aids',
    name: 'Artificial Intelligence & Data Science',
    degree: 'B.Tech (AI-DS)',
    category: 'cs',
    duration: '4 Years (8 Semesters)',
    intake: 60,
    dteCode: '417799510',
    highlights: [
      'Deep Learning & Neural Networks',
      'Natural Language Processing & GenAI',
      'Big Data Analytics & Business Intelligence',
      'Python, R & MLOps Pipelines',
    ],
    labs: [
      'Artificial Intelligence & ML Studio',
      'Data Analytics & Big Data Lab',
      'High Performance Computing Cluster',
    ],
    careers: [
      'AI / Machine Learning Engineer',
      'Data Scientist & Analytics Consultant',
      'Computer Vision & NLP Specialist',
    ],
    eligibility: 'Passed 10+2 / HSC with Physics & Mathematics + Chemistry/CS/IT (min 45% aggregate) with valid MHT-CET or JEE (Main) score.',
  },
  {
    id: 'it',
    name: 'Information Technology',
    degree: 'B.Tech (IT)',
    category: 'cs',
    duration: '4 Years (8 Semesters)',
    intake: 60,
    dteCode: '417724610',
    highlights: [
      'Cyber Security & Cryptography',
      'Distributed Systems & Cloud-Native Apps',
      'Mobile App Development (Android/iOS)',
      'Enterprise Database Systems',
    ],
    labs: [
      'Information Security & Ethical Hacking Lab',
      'Network Systems & Cisco Routing Lab',
      'Mobile Applications Development Center',
    ],
    careers: [
      'Cloud Solutions Architect',
      'Cyber Security Analyst',
      'Enterprise Application Specialist',
    ],
    eligibility: 'Passed 10+2 / HSC with Physics & Mathematics + Chemistry/CS/IT (min 45% aggregate) with valid MHT-CET or JEE (Main) score.',
  },
  {
    id: 'ece',
    name: 'Electronics & Communication Engineering',
    degree: 'B.Tech (ECE)',
    category: 'core',
    duration: '4 Years (8 Semesters)',
    intake: 60,
    dteCode: '417737210',
    highlights: [
      'VLSI Design & Semiconductor Tech',
      'Internet of Things (IoT) & Smart Sensors',
      'Embedded Firmware & Microcontrollers',
      '5G & Wireless Communication Networks',
    ],
    labs: [
      'VLSI Design & Cadence Simulation Lab',
      'IoT & Embedded Systems Workshop',
      'Advanced Digital Signal Processing Lab',
    ],
    careers: [
      'VLSI & ASIC Design Engineer',
      'Embedded Software & Firmware Developer',
      'Telecom & Wireless Systems Engineer',
    ],
    eligibility: 'Passed 10+2 / HSC with Physics & Mathematics + Chemistry/Biology/Tech (min 45% aggregate) with valid MHT-CET or JEE (Main) score.',
  },
  {
    id: 'mech',
    name: 'Mechanical Engineering',
    degree: 'B.Tech (MECH)',
    category: 'core',
    duration: '4 Years (8 Semesters)',
    intake: 60,
    dteCode: '417761210',
    highlights: [
      'CAD/CAM/CAE with SolidWorks & CATIA',
      'Industrial Robotics & Automation',
      'Thermal Systems & EV Mechanicals',
      'Additive Manufacturing (3D Printing)',
    ],
    labs: [
      'CNC Machine & Smart Automation Lab',
      'Mechatronics & Robotics Center',
      'Material Testing & Metallurgy Lab',
    ],
    careers: [
      'Mechanical Design Engineer',
      'Automotive & EV Chassis Specialist',
      'Plant Operations & Automation Manager',
    ],
    eligibility: 'Passed 10+2 / HSC with Physics & Mathematics + Chemistry/Biology/Tech (min 45% aggregate) with valid MHT-CET or JEE (Main) score.',
  },
  {
    id: 'ee',
    name: 'Electrical Engineering',
    degree: 'B.Tech (EE)',
    category: 'core',
    duration: '4 Years (8 Semesters)',
    intake: 60,
    dteCode: '417729310',
    highlights: [
      'Electric Vehicle (EV) Powertrains & Battery BMS',
      'Smart Grid & Solar Renewable Energy',
      'Industrial PLC & SCADA Automation',
      'Power Electronics & Control Systems',
    ],
    labs: [
      'Power Electronics & Drives Lab',
      'Solar Renewable Energy Center',
      'Electrical Machines & Switchgear Lab',
    ],
    careers: [
      'EV Powertrain & Battery Systems Engineer',
      'Power Grid & Renewable Energy Consultant',
      'Industrial Automation & PLC Specialist',
    ],
    eligibility: 'Passed 10+2 / HSC with Physics & Mathematics + Chemistry/Biology/Tech (min 45% aggregate) with valid MHT-CET or JEE (Main) score.',
  },
  {
    id: 'civil',
    name: 'Civil Engineering',
    degree: 'B.Tech (CIVIL)',
    category: 'core',
    duration: '4 Years (8 Semesters)',
    intake: 60,
    dteCode: '417719110',
    highlights: [
      'Smart City Infrastructure & Planning',
      'STAAD.Pro, AutoCAD & BIM Modeling',
      'Geotechnical & Advanced Surveying (GIS/GPS)',
      'Green Building & Sustainable Concrete',
    ],
    labs: [
      'Concrete Technology & Highway Materials Lab',
      'Advanced Surveying with Total Station Lab',
      'Geotechnical Engineering & Soil Mechanics Lab',
    ],
    careers: [
      'Structural Design & Analysis Engineer',
      'Urban Infrastructure Project Manager',
      'Govt. Civil Works Consultant (PWD/CPWD)',
    ],
    eligibility: 'Passed 10+2 / HSC with Physics & Mathematics + Chemistry/Biology/Tech (min 45% aggregate) with valid MHT-CET or JEE (Main) score.',
  },
  {
    id: 'mca',
    name: 'Master of Computer Applications',
    degree: 'MCA',
    category: 'pg',
    duration: '2 Years (4 Semesters)',
    intake: 60,
    dteCode: '417724110',
    highlights: [
      'Enterprise Java & Cloud Architecture',
      'Full-Stack Frameworks (React, Node, Angular)',
      'Enterprise Database Engineering (PostgreSQL/Oracle)',
      'Industry Internship & Corporate Capstone',
    ],
    labs: [
      'Software Innovation & Project Lab',
      'Database Systems & Analytics Center',
      'Application Development Studio',
    ],
    careers: [
      'Senior Application Developer',
      'Enterprise Software Consultant',
      'Database Architect & IT Project Manager',
    ],
    eligibility: 'Passed BCA or Bachelor Degree in Computer Science Engineering or equivalent (min 50% marks) with valid MAH-MCA-CET score.',
  },
];

@Component({
  selector: 'rp-college-brochure',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="brochure-page" id="brochure-root">
      <!-- Top Action Bar -->
      <div class="brochure-topbar">
        <div class="brochure-container row-between">
          <div class="top-nav-left">
            <a class="back-link" [routerLink]="formLink()">
              <rp-icon name="arrowl" [size]="15" />
              <span>Back to Admission Portal</span>
            </a>
          </div>
          <div class="top-nav-right">
            <button type="button" class="btn btn-sec btn-sm" (click)="printBrochure()">
              <rp-icon name="download" [size]="14" />
              <span>Print / Save Brochure</span>
            </button>
            <a [routerLink]="formLink()" class="btn btn-pri btn-sm">
              <rp-icon name="sparkles" [size]="14" />
              <span>Apply Online Now</span>
            </a>
          </div>
        </div>
      </div>

      <!-- College Hero Banner -->
      <section class="brochure-hero">
        <div class="brochure-container">
          <div class="hero-badges">
            <span class="badge badge-accent">DTE Choice Code: 4177</span>
            <span class="badge badge-subtle">AICTE Approved</span>
            <span class="badge badge-subtle">Affiliated to RTMNU Nagpur</span>
            <span class="badge badge-ok">NAAC Accredited</span>
          </div>

          <h1 class="hero-title">Priyadarshini Bhagwati College of Engineering</h1>
          <p class="hero-tagline">
            Harpur Nagar, Umred Road, Nagpur - 440024 · Run by Lokmanya Tilak Jankalyan Shikshan Sanstha (LTJSS)
          </p>
          <p class="hero-lead">
            Empowering aspiring engineers with world-class technical education, cutting-edge innovation labs, 
            autonomous industry curricula, and exceptional campus placements.
          </p>

          <!-- Key Stats Grid -->
          <div class="stats-ribbon">
            <div class="stat-card">
              <div class="stat-num">18+</div>
              <div class="stat-label">Years of Excellence</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">85%+</div>
              <div class="stat-label">Placement Track Record</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">₹12 LPA</div>
              <div class="stat-label">Highest Package Offered</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">600+</div>
              <div class="stat-label">Annual Intake Seats</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">100+</div>
              <div class="stat-label">Top Hiring Companies</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Main Content Area -->
      <div class="brochure-container brochure-body">
        <!-- Section: Courses & Programs Offered -->
        <section class="content-section" id="courses">
          <div class="section-head">
            <span class="section-kicker">Academic Catalog</span>
            <h2 class="section-title">Courses & Programs Offered</h2>
            <p class="section-sub">
              Industry-aligned undergraduate B.Tech engineering degrees and post-graduate MCA programs 
              tailored for high-growth tech careers.
            </p>

            <!-- Category Filter Tabs -->
            <div class="filter-tabs" role="tablist">
              <button
                type="button"
                class="tab-btn"
                [class.active]="filter() === 'all'"
                (click)="filter.set('all')"
              >
                All Programs (8)
              </button>
              <button
                type="button"
                class="tab-btn"
                [class.active]="filter() === 'cs'"
                (click)="filter.set('cs')"
              >
                Computer & AI Group (3)
              </button>
              <button
                type="button"
                class="tab-btn"
                [class.active]="filter() === 'core'"
                (click)="filter.set('core')"
              >
                Core Engineering (4)
              </button>
              <button
                type="button"
                class="tab-btn"
                [class.active]="filter() === 'pg'"
                (click)="filter.set('pg')"
              >
                Post-Graduate MCA (1)
              </button>
            </div>
          </div>

          <!-- Courses Grid -->
          <div class="courses-grid">
            @for (c of filteredCourses(); track c.id) {
              <div class="course-card">
                <div class="course-header">
                  <div class="course-badge-row">
                    <span class="degree-chip">{{ c.degree }}</span>
                    <span class="intake-chip">{{ c.intake }} Seats</span>
                  </div>
                  <h3 class="course-name">{{ c.name }}</h3>
                  <div class="course-meta">
                    <span><rp-icon name="clock" [size]="14" /> {{ c.duration }}</span>
                    <span><rp-icon name="tag" [size]="14" /> DTE Code: {{ c.dteCode }}</span>
                  </div>
                </div>

                <div class="course-body">
                  <div class="info-group">
                    <h4 class="group-title">Key Learning Areas:</h4>
                    <ul class="bullet-list">
                      @for (h of c.highlights; track h) {
                        <li>{{ h }}</li>
                      }
                    </ul>
                  </div>

                  <div class="info-group">
                    <h4 class="group-title">Dedicated Laboratories:</h4>
                    <div class="tag-cloud">
                      @for (l of c.labs; track l) {
                        <span class="lab-tag">{{ l }}</span>
                      }
                    </div>
                  </div>

                  <div class="info-group">
                    <h4 class="group-title">Career Opportunities:</h4>
                    <p class="careers-text">{{ c.careers.join(' · ') }}</p>
                  </div>

                  <div class="eligibility-box">
                    <strong>Eligibility:</strong> {{ c.eligibility }}
                  </div>
                </div>

                <div class="course-footer">
                  <a [routerLink]="formLink()" class="btn btn-sec btn-sm full-w">
                    <span>Apply for {{ c.degree }}</span>
                    <rp-icon name="arrowr" [size]="14" />
                  </a>
                </div>
              </div>
            }
          </div>
        </section>

        <!-- Section: Admission Procedure & CAP Rounds -->
        <section class="content-section" id="admission-process">
          <div class="section-head">
            <span class="section-kicker">Admission Guide</span>
            <h2 class="section-title">How to Secure Admission at PBCOE</h2>
            <p class="section-sub">
              Admissions are conducted transparently via DTE Maharashtra Centralized Admission Process (CAP) 
              as well as Institutional / Vacant Seat Quotas.
            </p>
          </div>

          <div class="steps-grid">
            <div class="step-card">
              <div class="step-num">1</div>
              <h4 class="step-title">DTE Portal Registration</h4>
              <p class="step-desc">
                Register on the official Maharashtra CET Cell portal with your MHT-CET or JEE (Main) scorecards.
              </p>
            </div>
            <div class="step-card">
              <div class="step-num">2</div>
              <h4 class="step-title">Scrutiny & Verification</h4>
              <p class="step-desc">
                Verify original documents online or in-person at designated Facilitation Centers (FC).
              </p>
            </div>
            <div class="step-card">
              <div class="step-num">3</div>
              <h4 class="step-title">Option Form Choice (4177)</h4>
              <p class="step-desc">
                Put <b>4177 (PBCOE Nagpur)</b> as your top preference for CSE, AI-DS, IT, ECE, ME, EE, or Civil.
              </p>
            </div>
            <div class="step-card">
              <div class="step-num">4</div>
              <h4 class="step-title">Seat Confirmation & Reporting</h4>
              <p class="step-desc">
                Accept seat allotment in CAP Rounds or approach College Admission Desk directly for spot confirmation.
              </p>
            </div>
          </div>
        </section>

        <!-- Section: Fees & Government Scholarships -->
        <section class="content-section" id="scholarships">
          <div class="scholarship-card">
            <div class="scholarship-content">
              <span class="section-kicker text-orange">Financial Assistance</span>
              <h2 class="section-title">Fees & Government Scholarships</h2>
              <p class="section-sub">
                100% assistance provided for all Government of Maharashtra MahaDBT scholarship schemes:
              </p>
              <div class="scholarship-grid">
                <div class="sch-item">
                  <div class="sch-title">MahaDBT Freeship / EBC</div>
                  <div class="sch-desc">50% Tuition fee concession for Economically Backward Class (EBC) students.</div>
                </div>
                <div class="sch-item">
                  <div class="sch-title">SC / ST Social Welfare Scheme</div>
                  <div class="sch-desc">100% Tuition & Development fee waiver for eligible SC/ST category candidates.</div>
                </div>
                <div class="sch-item">
                  <div class="sch-title">VJNT / SBC / OBC Concessions</div>
                  <div class="sch-desc">Tuition fee reimbursement as per State Government welfare regulations.</div>
                </div>
                <div class="sch-item">
                  <div class="sch-title">TFWS (Tuition Fee Waiver Scheme)</div>
                  <div class="sch-desc">100% Tuition Fee waived for top 5% merit rankers allotted via CAP rounds.</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Section: Campus Placements & Facilities -->
        <section class="content-section" id="placements">
          <div class="section-head">
            <span class="section-kicker">Career Launchpad</span>
            <h2 class="section-title">Training & Placement Records</h2>
            <p class="section-sub">
              Our full-time Training & Placement Cell trains students right from second year in technical stacks, 
              mock interviews, soft skills, and aptitude testing.
            </p>
          </div>

          <div class="recruiters-card">
            <div class="recruiters-title">Major Corporate Recruiters:</div>
            <div class="recruiter-tags">
              <span class="rc-tag">Tata Consultancy Services (TCS)</span>
              <span class="rc-tag">Infosys</span>
              <span class="rc-tag">Tech Mahindra</span>
              <span class="rc-tag">Cognizant</span>
              <span class="rc-tag">Wipro</span>
              <span class="rc-tag">Capgemini</span>
              <span class="rc-tag">Persistent Systems</span>
              <span class="rc-tag">L&T Infotech</span>
              <span class="rc-tag">Hexaware</span>
              <span class="rc-tag">HCL Technologies</span>
              <span class="rc-tag">Reliance Jio</span>
              <span class="rc-tag">Amdocs</span>
            </div>
          </div>

          <div class="facilities-grid">
            <div class="fac-card">
              <div class="fac-icon"><rp-icon name="book" [size]="22" /></div>
              <h4>Central Digital Library</h4>
              <p>25,000+ technical volumes, DELNET, IEEE & Springer digital access with 24x7 study reading room.</p>
            </div>
            <div class="fac-card">
              <div class="fac-icon"><rp-icon name="wifi" [size]="22" /></div>
              <h4>Wi-Fi & Innovation Labs</h4>
              <p>High-speed campus-wide leased internet, AI & IoT studios, Incubation and Start-up center.</p>
            </div>
            <div class="fac-card">
              <div class="fac-icon"><rp-icon name="truck" [size]="22" /></div>
              <h4>College Bus Fleet</h4>
              <p>Dedicated institute bus transportation covering all sectors of Nagpur city and suburbs.</p>
            </div>
            <div class="fac-card">
              <div class="fac-icon"><rp-icon name="home" [size]="22" /></div>
              <h4>Hostels & Dining</h4>
              <p>Separate secure hostels for boys and girls with hygienic mess, RO water, and round-the-clock security.</p>
            </div>
          </div>
        </section>

        <!-- Section: Contact & Helpdesk -->
        <section class="content-section" id="contact">
          <div class="contact-box">
            <div class="contact-left">
              <h3>Have Questions? Contact Admission Desk</h3>
              <p>Visit our campus counseling center or speak directly to our admissions faculty counsellors.</p>
              <div class="contact-rows">
                <div><rp-icon name="pin" [size]="16" /> Harpur Nagar, Umred Road, Nagpur, Maharashtra - 440024</div>
                <div><rp-icon name="phone" [size]="16" /> +91 712 2712933 · +91 98230 00000</div>
                <div><rp-icon name="mail" [size]="16" /> admissions&#64;pbcoe.edu.in · principal&#64;pbcoe.edu.in</div>
              </div>
            </div>
            <div class="contact-right">
              <a [routerLink]="formLink()" class="btn btn-pri btn-lg">
                <rp-icon name="sparkles" [size]="16" />
                <span>Fill Admission Form Online</span>
              </a>
            </div>
          </div>
        </section>
      </div>

      <!-- Bottom Floating Sticky Bar -->
      <aside class="floating-cta-bar" aria-label="Admissions Call to Action">
        <div class="brochure-container row-between">
          <div class="cta-left">
            <strong>Admissions Open · Academic Year 2026-27</strong>
            <span class="cta-sub">DTE Choice Code: <b>4177</b> · PBCOE Nagpur</span>
          </div>
          <div class="cta-right">
            <button type="button" class="btn btn-sec btn-sm" (click)="printBrochure()">
              <rp-icon name="download" [size]="14" />
              <span>Download Brochure</span>
            </button>
            <a [routerLink]="formLink()" class="btn btn-pri btn-sm">
              <rp-icon name="arrowr" [size]="14" />
              <span>Apply Online Now</span>
            </a>
          </div>
        </div>
      </aside>
    </div>
  `,
  styles: `
    .brochure-page {
      background: #FAF7F2;
      color: #1E293B;
      font-family: inherit;
      min-height: 100vh;
      padding-bottom: 90px;
    }
    .brochure-container {
      max-width: 1140px;
      margin: 0 auto;
      padding: 0 20px;
    }
    .row-between {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brochure-topbar {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid rgba(226, 218, 205, 0.8);
      padding: 12px 0;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #64748B;
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 600;
      transition: color 0.15s ease;
    }
    .back-link:hover {
      color: #EA580C;
    }
    .top-nav-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brochure-hero {
      background: linear-gradient(180deg, #FFFFFF 0%, #FAF7F2 100%);
      border-bottom: 1px solid rgba(226, 218, 205, 0.7);
      padding: 40px 0 32px;
      text-align: center;
    }
    .hero-badges {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .badge-accent {
      background: #EA580C;
      color: #FFFFFF;
      box-shadow: 0 2px 8px rgba(234, 88, 12, 0.25);
    }
    .badge-subtle {
      background: rgba(236, 227, 213, 0.85);
      color: #475569;
      border: 1px solid rgba(226, 218, 205, 0.9);
    }
    .badge-ok {
      background: rgba(16, 185, 129, 0.12);
      color: #047857;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }
    .hero-title {
      font-size: 32px;
      font-weight: 800;
      color: #0F172A;
      letter-spacing: -0.02em;
      line-height: 1.2;
      margin: 0 0 10px;
    }
    .hero-tagline {
      font-size: 14px;
      font-weight: 600;
      color: #64748B;
      margin: 0 0 12px;
    }
    .hero-lead {
      max-width: 780px;
      margin: 0 auto 32px;
      font-size: 15.5px;
      color: #334155;
      line-height: 1.6;
    }
    .stats-ribbon {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      max-width: 980px;
      margin: 0 auto;
    }
    .stat-card {
      background: #FFFFFF;
      border: 1px solid rgba(226, 218, 205, 0.8);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 4px 14px -3px rgba(150, 125, 95, 0.08);
    }
    .stat-num {
      font-size: 26px;
      font-weight: 800;
      color: #EA580C;
      line-height: 1.1;
      margin-bottom: 4px;
    }
    .stat-label {
      font-size: 12.5px;
      font-weight: 600;
      color: #64748B;
    }
    .brochure-body {
      padding-top: 36px;
    }
    .content-section {
      margin-bottom: 50px;
    }
    .section-head {
      text-align: center;
      max-width: 760px;
      margin: 0 auto 30px;
    }
    .section-kicker {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #EA580C;
      margin-bottom: 6px;
    }
    .section-title {
      font-size: 26px;
      font-weight: 800;
      color: #0F172A;
      letter-spacing: -0.015em;
      margin: 0 0 8px;
    }
    .section-sub {
      font-size: 14.5px;
      color: #64748B;
      line-height: 1.5;
      margin: 0;
    }
    .filter-tabs {
      display: inline-flex;
      background: rgba(236, 227, 213, 0.7);
      border: 1px solid rgba(226, 218, 205, 0.95);
      border-radius: 12px;
      padding: 4px;
      gap: 4px;
      margin-top: 20px;
    }
    .tab-btn {
      padding: 8px 16px;
      border-radius: 9px;
      font-size: 13px;
      font-weight: 600;
      color: #64748B;
      border: none;
      background: transparent;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .tab-btn:hover {
      color: #1E293B;
    }
    .tab-btn.active {
      background: #FFFFFF;
      color: #C2410C;
      font-weight: 700;
      box-shadow: 0 2px 8px rgba(150, 125, 95, 0.12);
    }
    .courses-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 20px;
    }
    .course-card {
      background: #FFFFFF;
      border: 1px solid rgba(226, 218, 205, 0.85);
      border-radius: 18px;
      padding: 22px;
      box-shadow: 0 8px 24px -6px rgba(150, 125, 95, 0.06);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .course-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 30px -6px rgba(150, 125, 95, 0.12);
      border-color: rgba(234, 88, 12, 0.4);
    }
    .course-header {
      border-bottom: 1px solid rgba(226, 218, 205, 0.6);
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .course-badge-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .degree-chip {
      font-size: 12px;
      font-weight: 700;
      color: #C2410C;
      background: rgba(234, 88, 12, 0.12);
      padding: 2px 10px;
      border-radius: 999px;
    }
    .intake-chip {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      background: #F1F5F9;
      padding: 2px 10px;
      border-radius: 999px;
    }
    .course-name {
      font-size: 18px;
      font-weight: 750;
      color: #0F172A;
      margin: 0 0 8px;
      line-height: 1.3;
    }
    .course-meta {
      display: flex;
      align-items: center;
      gap: 14px;
      font-size: 12.5px;
      color: #64748B;
    }
    .course-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-bottom: 18px;
    }
    .info-group {
      font-size: 13px;
    }
    .group-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #475569;
      margin: 0 0 6px;
    }
    .bullet-list {
      margin: 0;
      padding-left: 18px;
      color: #334155;
      line-height: 1.5;
    }
    .tag-cloud {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .lab-tag {
      background: rgba(245, 239, 230, 0.8);
      color: #475569;
      font-size: 11.5px;
      font-weight: 600;
      padding: 3px 9px;
      border-radius: 6px;
    }
    .careers-text {
      margin: 0;
      color: #047857;
      font-weight: 600;
      font-size: 12.5px;
      line-height: 1.4;
    }
    .eligibility-box {
      background: rgba(255, 251, 235, 0.9);
      border: 1px dashed rgba(217, 119, 6, 0.4);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 12px;
      color: #92400E;
      line-height: 1.4;
    }
    .full-w {
      width: 100%;
      justify-content: center;
    }
    .steps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .step-card {
      background: #FFFFFF;
      border: 1px solid rgba(226, 218, 205, 0.85);
      border-radius: 16px;
      padding: 20px;
      position: relative;
    }
    .step-num {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #F97316, #EA580C);
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 15px;
      margin-bottom: 12px;
    }
    .step-title {
      font-size: 15px;
      font-weight: 750;
      color: #0F172A;
      margin: 0 0 6px;
    }
    .step-desc {
      font-size: 13px;
      color: #64748B;
      line-height: 1.45;
      margin: 0;
    }
    .scholarship-card {
      background: #FFFFFF;
      border: 1px solid rgba(226, 218, 205, 0.85);
      border-radius: 20px;
      padding: 30px;
      box-shadow: 0 8px 24px -6px rgba(150, 125, 95, 0.06);
    }
    .scholarship-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }
    .sch-item {
      background: rgba(254, 243, 199, 0.4);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 12px;
      padding: 16px;
    }
    .sch-title {
      font-size: 14.5px;
      font-weight: 700;
      color: #92400E;
      margin-bottom: 4px;
    }
    .sch-desc {
      font-size: 12.5px;
      color: #78350F;
      line-height: 1.4;
    }
    .recruiters-card {
      background: #FFFFFF;
      border: 1px solid rgba(226, 218, 205, 0.85);
      border-radius: 18px;
      padding: 24px;
      margin-bottom: 24px;
      text-align: center;
    }
    .recruiters-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #475569;
      margin-bottom: 14px;
    }
    .recruiter-tags {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
    }
    .rc-tag {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      color: #0F172A;
      font-size: 13px;
      font-weight: 650;
      padding: 6px 14px;
      border-radius: 8px;
    }
    .facilities-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 16px;
    }
    .fac-card {
      background: #FFFFFF;
      border: 1px solid rgba(226, 218, 205, 0.8);
      border-radius: 16px;
      padding: 20px;
    }
    .fac-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(234, 88, 12, 0.12);
      color: #EA580C;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 12px;
    }
    .fac-card h4 {
      font-size: 15px;
      font-weight: 750;
      color: #0F172A;
      margin: 0 0 6px;
    }
    .fac-card p {
      font-size: 13px;
      color: #64748B;
      line-height: 1.45;
      margin: 0;
    }
    .contact-box {
      background: linear-gradient(135deg, #1E293B, #0F172A);
      color: #FFFFFF;
      border-radius: 20px;
      padding: 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 24px;
    }
    .contact-left h3 {
      font-size: 22px;
      font-weight: 800;
      margin: 0 0 6px;
    }
    .contact-left p {
      color: #94A3B8;
      font-size: 14px;
      margin: 0 0 16px;
    }
    .contact-rows {
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 13.5px;
      color: #E2E8F0;
    }
    .contact-rows div {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .floating-cta-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(10px);
      border-top: 1px solid rgba(226, 218, 205, 0.9);
      box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
      padding: 12px 0;
      z-index: 99;
    }
    .cta-left strong {
      display: block;
      font-size: 14.5px;
      color: #0F172A;
    }
    .cta-sub {
      font-size: 12.5px;
      color: #64748B;
    }
    .cta-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    @media (max-width: 768px) {
      .hero-title {
        font-size: 24px;
      }
      .courses-grid {
        grid-template-columns: 1fr;
      }
      .cta-left {
        display: none;
      }
      .floating-cta-bar .row-between {
        justify-content: center;
      }
    }
    @media print {
      .brochure-topbar,
      .floating-cta-bar {
        display: none !important;
      }
      .brochure-page {
        padding-bottom: 0 !important;
        background: #fff !important;
      }
    }
  `,
})
export class CollegeBrochure {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly ctx = inject(AdmissionsContext);

  protected readonly filter = signal<'all' | 'cs' | 'core' | 'pg'>('all');
  protected readonly courses = signal<readonly CourseInfo[]>(COURSES);

  protected readonly linkToken = computed(() => {
    return this.route.snapshot.paramMap.get('linkToken') ?? '';
  });

  protected readonly formLink = computed(() => {
    const t = this.linkToken();
    return t ? `/admissions/${t}` : '/admissions/status';
  });

  protected readonly filteredCourses = computed(() => {
    const f = this.filter();
    const all = this.courses();
    if (f === 'all') return all;
    return all.filter((c) => c.category === f);
  });

  constructor() {
    const token = this.route.snapshot.paramMap.get('linkToken');
    if (token) {
      void this.ctx.load(token);
    }
  }

  protected printBrochure() {
    window.print();
  }
}
