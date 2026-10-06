import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MechanismFlow, ActionPotential, EcgTypes, GeneticsChart, EpiRegulation } from '../components/brsDiagrams'

// ============================================================
// Comprehensive Brugada Syndrome reference content.
// Educational synthesis of established cardiology / cardiac-EP
// knowledge; verify specifics against primary sources & current
// guidelines. Section bodies are consumed by pages/Theory.tsx.
// ============================================================

function KB({ kind, label, children }: { kind: 'hy' | 'research' | 'clin'; label: string; children: ReactNode }) {
  return (
    <div className={`keybox ${kind}`}>
      <span className="kb-l">{label}</span>
      {children}
    </div>
  )
}

export interface TheorySection {
  id: string
  group: string
  title: string
  body: ReactNode
}

export const THEORY: TheorySection[] = [
  // ---------------- FOUNDATIONS ----------------
  {
    id: 'overview',
    group: 'Foundations',
    title: 'Overview & definition',
    body: (
      <>
        <p><span className="term">Brugada Syndrome (BrS)</span> is an inherited primary electrical disease — a cardiac <b>channelopathy</b> — defined by a <b>coved-type (type-1) ST-segment elevation</b> in the right precordial leads (V1–V2), predisposing to <b>polymorphic ventricular tachycardia / ventricular fibrillation (VF)</b> and <b>sudden cardiac death (SCD)</b>, classically in a <b>structurally normal heart</b>.</p>
        <p>It sits within the broader spectrum of <b>cardiac sodium channelopathies</b> and inherited arrhythmia syndromes. At its core it is a <b>loss-of-function</b> disorder of the cardiac sodium current (I<sub>Na</sub>): less inward sodium current → slowed conduction and/or heterogeneous repolarization → the type-1 ECG and a substrate for re-entrant VF.</p>
        <ul>
          <li>Events are characteristically <b>nocturnal / at rest</b>, at low heart rates, and are dynamically modulated by <b>fever</b> and autonomic tone.</li>
          <li>The heart is usually structurally normal on standard imaging, though subtle <b>right-ventricular outflow tract (RVOT)</b> abnormalities are increasingly recognised.</li>
        </ul>
        <MechanismFlow />
        <KB kind="hy" label="High-yield">
          The single organising fact: BrS is a <b>reduced-I<sub>Na</sub></b> disease. Genetics, ECG, triggers, risk and therapy all orbit that sodium-current axis.
        </KB>
      </>
    ),
  },
  {
    id: 'history',
    group: 'Foundations',
    title: 'History',
    body: (
      <>
        <ul>
          <li><b>Pre-1990s</b> — "sudden unexpected nocturnal death syndrome" (SUNDS) long described in Southeast/East Asia: <i>Lai Tai</i> (Thailand), <i>Bangungut</i> (Philippines), <i>Pokkuri</i> (Japan) — later recognised as largely BrS.</li>
          <li><b>1992</b> — Pedro & Josep <b>Brugada</b> report the clinical–electrocardiographic syndrome (RBBB-like pattern + right-precordial ST elevation + SCD in structurally normal hearts).</li>
          <li><b>1998</b> — <b>SCN5A</b> identified as the first BrS gene (Chen et&nbsp;al., <i>Nature</i>).</li>
          <li><b>2002 & 2005</b> — consensus conferences establish diagnostic criteria and ECG types.</li>
          <li><b>2013</b> — HRS/EHRA/APHRS expert consensus; <b>2015</b> ESC guidelines on ventricular arrhythmias/SCD.</li>
          <li><b>2016</b> — the <b>Shanghai score</b> formalises a probabilistic diagnosis.</li>
          <li><b>2018</b> — ClinGen reappraisal: of the many "BrS genes", only <b>SCN5A</b> has definitive evidence — a major recalibration.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'epidemiology',
    group: 'Foundations',
    title: 'Epidemiology',
    body: (
      <>
        <ul>
          <li><b>Prevalence</b> — roughly <b>1–5 per 10,000</b> in Western populations; substantially higher in <b>Southeast/East Asia</b> (estimates up to ~1 per 1,000–2,000).</li>
          <li><b>Sex</b> — clinically <b>male predominant (~8–9 : 1)</b> despite autosomal transmission with equal inheritance, attributed to a larger <b>I<sub>to</sub></b> under testosterone.</li>
          <li><b>Age</b> — peak arrhythmic events in the <b>3rd–4th decade</b> (mean ~40y), but a paediatric, <b>fever-triggered</b> tail and an association with SIDS exist.</li>
          <li>A meaningful contributor to SCD in young adults with structurally normal hearts.</li>
        </ul>
        <KB kind="clin" label="Clinical pearl">
          The <b>genotype</b> transmits equally to both sexes; the <b>phenotype</b> and event risk are skewed to men — a penetrance/expressivity gap that regulatory and hormonal factors (and, plausibly, epigenetics) help explain.
        </KB>
      </>
    ),
  },
  {
    id: 'genetics',
    group: 'Foundations',
    title: 'Genetics & inheritance',
    body: (
      <>
        <p>Inheritance is classically <b>autosomal dominant</b> with <b>incomplete penetrance</b> and <b>variable expressivity</b>. <span className="term">SCN5A</span> (Na<sub>v</sub>1.5) is the only gene with <b>definitive</b> evidence and accounts for only <b>~20–30%</b> of cases — leaving a large <b>genotype-negative majority</b>.</p>
        <GeneticsChart />
        <div className="tbl-scroll">
          <table>
            <thead><tr><th>Gene</th><th>Product</th><th>Effect</th><th>Evidence</th></tr></thead>
            <tbody>
              <tr><td><b>SCN5A</b></td><td>Na<sub>v</sub>1.5 α</td><td>↓ I<sub>Na</sub> (LoF)</td><td className="muted"><b>Definitive</b> · ~20–30%</td></tr>
              <tr><td>SCN10A</td><td>Na<sub>v</sub>1.8</td><td>Modulates conduction / Na<sub>v</sub>1.5</td><td className="muted">GWAS locus; gene-level disputed</td></tr>
              <tr><td>CACNA1C / CACNB2</td><td>L-type Ca channel</td><td>↓ I<sub>Ca,L</sub></td><td className="muted">Limited; BrS+short-QT overlap</td></tr>
              <tr><td>SCN1B / SCN3B</td><td>Na channel β</td><td>Altered trafficking/gating</td><td className="muted">Limited</td></tr>
              <tr><td>GPD1L</td><td>—</td><td>↓ Na<sub>v</sub>1.5 surface</td><td className="muted">Disputed</td></tr>
              <tr><td>KCND3</td><td>K<sub>v</sub>4.3 (I<sub>to</sub>)</td><td>↑ I<sub>to</sub></td><td className="muted">Limited</td></tr>
              <tr><td>HEY2 (region)</td><td>Transcription factor</td><td>Transmural gradient</td><td className="muted">Common-variant (GWAS)</td></tr>
            </tbody>
          </table>
        </div>
        <p>The field has moved from a <b>monogenic</b> to an <b>oligogenic / polygenic</b> model: common variants at the <b>SCN5A–SCN10A</b> and <b>HEY2</b> loci contribute to conduction and risk, and a <b>polygenic burden</b> shapes penetrance. Genetic testing (mainly SCN5A) informs <b>cascade family screening</b>; beware variants of uncertain significance.</p>
        <KB kind="research" label="Research link">
          The strongest common-variant signals lie in <b>regulatory (enhancer/promoter)</b> DNA — precisely where DNA methylation and histone state operate. The unexplained ~70% is the doorway to <Link to="/theory">epigenetics</Link>.
        </KB>
      </>
    ),
  },
  {
    id: 'cellular',
    group: 'Foundations',
    title: 'Cellular & ionic electrophysiology',
    body: (
      <>
        <p>The ventricular action potential (AP) is shaped by a balance of inward and outward currents:</p>
        <div className="tbl-scroll">
          <table>
            <thead><tr><th>Phase</th><th>Event</th><th>Main current(s)</th></tr></thead>
            <tbody>
              <tr><td><b>0</b></td><td>Rapid upstroke / depolarization</td><td><b>I<sub>Na</sub></b> (Na<sub>v</sub>1.5)</td></tr>
              <tr><td><b>1</b></td><td>Early rapid repolarization ("notch")</td><td><b>I<sub>to</sub></b> (K<sub>v</sub>4.3) — epi &gt; endo, prominent in RVOT</td></tr>
              <tr><td><b>2</b></td><td>Plateau / "dome"</td><td>I<sub>Ca,L</sub> balanced against I<sub>to</sub> / I<sub>Kr</sub></td></tr>
              <tr><td><b>3</b></td><td>Repolarization</td><td>I<sub>Kr</sub>, I<sub>Ks</sub></td></tr>
              <tr><td><b>4</b></td><td>Resting potential</td><td>I<sub>K1</sub></td></tr>
            </tbody>
          </table>
        </div>
        <ActionPotential />
        <h3>Naᵥ1.5 & I_Na</h3>
        <p><b>Na<sub>v</sub>1.5</b> (a four-domain α-subunit with voltage sensors and a fast-inactivation gate) carries the phase-0 current that drives rapid conduction. BrS variants reduce functional I<sub>Na</sub> via <b>reduced expression/trafficking</b>, <b>altered gating</b> (enhanced/earlier inactivation, slowed recovery, negative shift of steady-state inactivation), or <b>non-functional</b> channels. It works in a <b>macromolecular complex</b> with β-subunits and trafficking partners, so its <b>membrane density</b> is a tightly regulated — and epigenetically controllable — quantity.</p>
        <KB kind="hy" label="High-yield">
          The <b>I<sub>to</sub> gradient</b> (epicardium &gt; endocardium, greatest in the RVOT and larger in men) is the anatomical setup that lets a reduced I<sub>Na</sub> tip repolarization into disaster.
        </KB>
      </>
    ),
  },

  // ---------------- MECHANISM ----------------
  {
    id: 'mechanism',
    group: 'Mechanism',
    title: 'Pathophysiology',
    body: (
      <>
        <p>Two classical (non-exclusive) hypotheses, plus an emerging structural view, connect reduced I<sub>Na</sub> to the type-1 ECG and VF.</p>
        <div className="tbl-scroll">
          <table>
            <thead><tr><th></th><th>Depolarization</th><th>Repolarization</th></tr></thead>
            <tbody>
              <tr><td><b>Core</b></td><td>Conduction delay in the <b>RVOT</b></td><td>Loss of the AP <b>dome</b> in RV epicardium</td></tr>
              <tr><td><b>Driver</b></td><td>↓ I<sub>Na</sub> → slow activation</td><td>↑ I<sub>to</sub> unopposed by ↓ I<sub>Na</sub> / ↓ I<sub>Ca,L</sub></td></tr>
              <tr><td><b>ST elevation</b></td><td>Delayed RVOT activation; current-to-load mismatch</td><td>Transmural voltage gradient (epi vs endo)</td></tr>
              <tr><td><b>Arrhythmia</b></td><td>Re-entry via slow conduction</td><td><b>Phase-2 re-entry</b></td></tr>
              <tr><td><b>Evidence</b></td><td>Fractionated RVOT electrograms, late potentials (SAECG), ablation success</td><td>Male predominance (I<sub>to</sub>), quinidine (I<sub>to</sub> block), arterially-perfused wedge preparations</td></tr>
            </tbody>
          </table>
        </div>
        <h3>Structural / "concealed cardiomyopathy" view</h3>
        <p>Epicardial biopsies and mapping show <b>RVOT fibrosis</b>, <b>reduced connexin-43</b> and inflammatory infiltrate in many patients — a slow-conduction substrate that blurs the channelopathy/cardiomyopathy boundary. <b>Autonomic tone</b> modulates the phenotype (vagal predominance at night raises risk; β-adrenergic stimulation reduces it).</p>
        <KB kind="hy" label="High-yield">
          All three views converge on the <b>RVOT epicardium</b> — the region where the ECG changes localise and where <b>epicardial substrate ablation</b> can abolish the type-1 pattern.
        </KB>
      </>
    ),
  },

  // ---------------- CLINICAL ----------------
  {
    id: 'presentation',
    group: 'Clinical',
    title: 'Clinical presentation & overlap',
    body: (
      <>
        <p>The clinical spectrum runs from <b>asymptomatic</b> (the majority, found incidentally or on screening) through <b>arrhythmic syncope</b> to <b>aborted SCD / SCD</b>. Events cluster <b>at rest, during sleep, or with fever</b>, often at low heart rates; <b>nocturnal agonal respiration</b> is a characteristic clue.</p>
        <ul>
          <li><b>Atrial fibrillation</b> is common (≈10–20%) and can be the presenting arrhythmia.</li>
          <li><b>Conduction disease</b> and <b>sinus node dysfunction</b> co-occur, especially with SCN5A variants.</li>
        </ul>
        <h3>The SCN5A overlap spectrum</h3>
        <p>The same locus produces a family of overlapping "cardiac sodium channelopathy" phenotypes — sometimes in one patient or family:</p>
        <div className="tbl-scroll">
          <table>
            <thead><tr><th>Phenotype</th><th>SCN5A effect</th></tr></thead>
            <tbody>
              <tr><td>Brugada syndrome</td><td><b>Loss</b> of function (↓ I<sub>Na</sub>)</td></tr>
              <tr><td>LQT3</td><td><b>Gain</b> of function (persistent late I<sub>Na</sub>)</td></tr>
              <tr><td>Progressive cardiac conduction disease (Lenègre)</td><td>Loss of function</td></tr>
              <tr><td>Sick sinus syndrome / atrial standstill</td><td>Loss of function</td></tr>
              <tr><td>Dilated cardiomyopathy, MEPPC, SIDS overlap</td><td>Variable</td></tr>
            </tbody>
          </table>
        </div>
        <KB kind="clin" label="Clinical pearl">
          <b>Fever is a major trigger</b> — especially in children — because some Na<sub>v</sub>1.5 variants are temperature-sensitive. Aggressive antipyresis is first-line prevention.
        </KB>
      </>
    ),
  },
  {
    id: 'ecg',
    group: 'Clinical',
    title: 'ECG features',
    body: (
      <>
        <div className="tbl-scroll">
          <table>
            <thead><tr><th>Type</th><th>Morphology</th><th>ST</th><th>T wave</th><th>Diagnostic?</th></tr></thead>
            <tbody>
              <tr><td><b>Type 1</b></td><td>Coved</td><td>≥2 mm, descending</td><td>Negative</td><td><b>Yes</b> (spontaneous or induced)</td></tr>
              <tr><td>Type 2</td><td>Saddleback</td><td>≥2 mm then ≥0.5 mm</td><td>Positive/biphasic</td><td className="muted">No — provoke</td></tr>
              <tr><td>Type 3</td><td>Saddle/coved</td><td>&lt;1 mm</td><td>—</td><td className="muted">No (merged into type 2 in 2013)</td></tr>
            </tbody>
          </table>
        </div>
        <EcgTypes />
        <p>Only the <b>type-1</b> pattern is diagnostic. Morphology criteria (e.g. the <b>β-angle</b> and the width of the r′ triangle base) help flag type-2 ECGs likely to convert. Sensitivity rises markedly with <b>high right precordial leads</b> at the 2nd–3rd intercostal space.</p>
        <h3>Dynamic modulators</h3>
        <p>Fever, sodium-channel blockers (<b>unmask</b>), vagal tone, a heavy meal / glucose-insulin, alcohol, ischaemia, electrolyte shifts and testosterone all accentuate or attenuate the pattern.</p>
        <h3>Other ECG risk markers</h3>
        <ul>
          <li><b>Fragmented QRS</b>, inferolateral <b>early repolarization</b>, wide <b>S-wave in lead I</b>, prolonged <b>Tpeak–Tend</b>, first-degree AV block and QRS prolongation each add prognostic weight.</li>
        </ul>
        <KB kind="clin" label="Exam trap">
          Type-2/3 patterns are <b>not</b> diagnostic alone, and a <b>drug-induced</b> type-1 in an asymptomatic person is far lower-risk than a <b>spontaneous</b> one.
        </KB>
      </>
    ),
  },
  {
    id: 'provocation',
    group: 'Clinical',
    title: 'Provocation & unmasking',
    body: (
      <>
        <p>A <b>sodium-channel-blocker challenge</b> unmasks type-1 in suspected cases with a non-diagnostic baseline ECG:</p>
        <div className="tbl-scroll">
          <table>
            <thead><tr><th>Agent</th><th>Typical dose</th><th>Note</th></tr></thead>
            <tbody>
              <tr><td><b>Ajmaline</b></td><td>1 mg/kg IV over 5 min</td><td>Most sensitive; short half-life</td></tr>
              <tr><td>Flecainide</td><td>2 mg/kg IV (≤150 mg) over 10 min</td><td>Widely used</td></tr>
              <tr><td>Procainamide</td><td>10 mg/kg IV over 10 min</td><td>Lower sensitivity</td></tr>
              <tr><td>Pilsicainide</td><td>1 mg/kg IV</td><td>Common in Japan</td></tr>
            </tbody>
          </table>
        </div>
        <p><b>Endpoints / stop rules</b>: appearance of a diagnostic type-1 pattern, ≥2 mm coved ST elevation, QRS widening ≥30%, or ventricular ectopy/arrhythmia. Perform with <b>continuous monitoring and full resuscitation</b> available (isoproterenol and sodium bicarbonate reverse toxicity). Other unmasking contexts include <b>fever</b> and the post-prandial state.</p>
        <KB kind="clin" label="Safety">
          The test carries a small but real risk of provoking sustained VA — it is a monitored, resuscitation-ready procedure, never casual.
        </KB>
      </>
    ),
  },
  {
    id: 'diagnosis',
    group: 'Clinical',
    title: 'Diagnosis & criteria',
    body: (
      <>
        <p>The cornerstone is a <b>type-1 ECG</b> (spontaneous or drug-induced) in <b>≥1 right precordial lead</b> in the standard or a high position. Modern consensus treats this pattern as sufficient; the <b>Shanghai score (2016)</b> adds probabilistic weighting from clinical, family and genetic data.</p>
        <div className="tbl-scroll">
          <table>
            <thead><tr><th>Domain</th><th>Weighted items (higher = stronger)</th></tr></thead>
            <tbody>
              <tr><td><b>ECG</b></td><td>Spontaneous type-1 &gt; fever-induced &gt; drug-induced type-1</td></tr>
              <tr><td><b>Clinical</b></td><td>Aborted cardiac arrest / documented VF/PVT &gt; nocturnal agonal respiration &gt; arrhythmic syncope &gt; AF at a young age</td></tr>
              <tr><td><b>Family history</b></td><td>BrS / SCD in a relative</td></tr>
              <tr><td><b>Genetics</b></td><td>Probable pathogenic SCN5A variant</td></tr>
            </tbody>
          </table>
        </div>
        <h3>Brugada phenocopies (exclude)</h3>
        <p>RBBB, ARVC, acute ischaemia / pulmonary embolism, hyperkalaemia and other electrolyte disturbance, mechanical causes (pectus, mediastinal mass), hypothermia, and athlete's heart can mimic the pattern.</p>
      </>
    ),
  },
  {
    id: 'risk',
    group: 'Clinical',
    title: 'Risk stratification',
    body: (
      <>
        <ul>
          <li><b>Highest</b> — aborted SCD or documented sustained VT/VF.</li>
          <li><b>Intermediate</b> — arrhythmic <b>syncope</b> with a <b>spontaneous type-1</b> ECG.</li>
          <li><b>Lower</b> — asymptomatic with only a <b>drug-induced</b> type-1.</li>
        </ul>
        <div className="tbl-scroll">
          <table>
            <thead><tr><th>Marker</th><th>Weight</th></tr></thead>
            <tbody>
              <tr><td>Spontaneous type-1 ECG</td><td><b>Strong</b></td></tr>
              <tr><td>Arrhythmic syncope</td><td>Strong</td></tr>
              <tr><td>Fragmented QRS, early repol, S-wave in I, long Tp–Te</td><td>Moderate</td></tr>
              <tr><td>SCN5A LoF / conduction disease</td><td>Moderate</td></tr>
              <tr><td>Family history of SCD</td><td>Weak</td></tr>
              <tr><td>EP-study-induced VF (programmed stimulation)</td><td className="muted">Controversial</td></tr>
            </tbody>
          </table>
        </div>
        <p>Composite <b>risk scores</b> (e.g. Sieira, BRUGADA-RISK, PRELUDE) combine these. The hardest decision remains the truly <b>asymptomatic</b> patient with a spontaneous type-1.</p>
      </>
    ),
  },
  {
    id: 'management',
    group: 'Clinical',
    title: 'Management',
    body: (
      <>
        <ul>
          <li><b>General</b> — aggressive <b>fever</b> treatment; avoid provoking drugs (see <i>brugadadrugs.org</i>, classes I & II); moderate alcohol and large meals.</li>
          <li><b>ICD</b> — for aborted SCD / documented VT/VF (secondary prevention) and high-risk primary prevention. The <b>subcutaneous ICD (S-ICD)</b> suits many (no pacing need); watch for <b>inappropriate shocks</b>.</li>
          <li><b>Quinidine</b> — I<sub>to</sub> blocker; for recurrent VF / electrical storm, when an ICD is declined, in children, or as adjunct.</li>
          <li><b>Isoproterenol</b> — acute <b>electrical storm</b> (↑ I<sub>Ca,L</sub>, restores the epicardial dome). Alternatives: cilostazol, bepridil, denopamine.</li>
          <li><b>Epicardial RVOT substrate ablation</b> — for recurrent VF/storm; can normalise the ECG substrate.</li>
          <li><b>Family screening & genetic counselling</b>; individualised sports and lifestyle advice.</li>
        </ul>
        <KB kind="clin" label="Electrical storm">
          First moves: treat any fever, start <b>isoproterenol</b>, load <b>quinidine</b>, and consider ablation of the RVOT substrate for refractory cases.
        </KB>
      </>
    ),
  },
  {
    id: 'special',
    group: 'Clinical',
    title: 'Special populations',
    body: (
      <>
        <ul>
          <li><b>Children</b> — presentations are often <b>fever-triggered</b>; SCN5A variants and conduction disease are more frequent; symptomatic young patients carry higher risk. An association with <b>SIDS</b> exists.</li>
          <li><b>Women</b> — lower event rates overall; risk rises with SCN5A LoF, longer conduction intervals, and a spontaneous type-1. Sex hormones modulate I<sub>to</sub>.</li>
          <li><b>Pregnancy</b> — generally well tolerated; manage fever and avoid provoking drugs.</li>
          <li><b>Athletes</b> — hyperthermia and the <b>post-exercise vagal surge</b> can accentuate the pattern; sports eligibility is individualised.</li>
          <li><b>Peri-operative / anaesthesia</b> — avoid triggering agents (caution with propofol and some local anaesthetics), control fever and electrolytes, and monitor.</li>
        </ul>
      </>
    ),
  },

  // ---------------- RESEARCH FRONTIER ----------------
  {
    id: 'epigenetics',
    group: 'Research frontier',
    title: 'Epigenetics',
    body: (
      <>
        <p>Because coding SCN5A explains a minority of cases and the strongest common signals are <b>regulatory</b>, attention has turned to control of the sodium-channel loci <b>above the DNA sequence</b>:</p>
        <ul>
          <li><b>DNA methylation</b> — 5mC at SCN5A/SCN10A promoters and enhancers, modulating expression (assayed by WGBS, RRBS, bisulfite / pyrosequencing).</li>
          <li><b>Histone modifications</b> — repressive <b>H3K27me3</b> vs active <b>H3K4me3 / H3K27ac</b> shaping chromatin state (ChIP-seq, CUT&amp;Tag).</li>
          <li><b>Chromatin accessibility</b> — open vs closed regulatory regions (ATAC-seq).</li>
          <li><b>3D architecture</b> — enhancer–promoter looping across the <b>SCN5A–SCN10A</b> locus (4C, Hi-C).</li>
          <li><b>Non-coding RNAs</b> — miRNAs (e.g. reported miR-24 / miR-98 / miR-200 family effects on Na<sub>v</sub>1.5) and lncRNAs (small-RNA-seq).</li>
        </ul>
        <EpiRegulation />
        <p>Functional causality is tested in <b>iPSC-derived cardiomyocytes</b> with patch clamp and multi-electrode arrays, including demethylation / rescue experiments.</p>
        <KB kind="research" label="Your project">
          This is the thesis of <b>studyex_medeetomilab / BrS-EPI</b>: promoter/enhancer methylation, repressive histone remodeling and ncRNAs reduce Na<sub>v</sub>1.5-dependent I<sub>Na</sub> <i>independently of, and additively to,</i> SCN5A coding mutations — potentially explaining variable penetrance. See the <Link to="/mechanism">Mechanism Map</Link>, <Link to="/hypotheses">Hypotheses</Link> and <Link to="/assays">Assays</Link>.
        </KB>
      </>
    ),
  },
  {
    id: 'biomarkers',
    group: 'Research frontier',
    title: 'Biomarkers & precision medicine',
    body: (
      <>
        <ul>
          <li><b>Genetic testing & polygenic risk scores</b> — cascade screening today; PRS emerging to capture the common-variant background.</li>
          <li><b>Epigenetic biomarkers</b> — a methylation index or miRNA panel correlated with phenotype and arrhythmic events, scored for effect size, replication, assayability and clinical actionability.</li>
          <li><b>iPSC-CM disease models</b> — patient-specific functional read-outs of I<sub>Na</sub> and conduction.</li>
        </ul>
        <p>The goal is <b>risk stratification beyond SCN5A status</b>. The hard problems: <b>tissue specificity</b> (blood ≠ cardiomyocyte), disentangling <b>causation from association</b>, and adequate <b>statistical power</b> for genome-wide discovery.</p>
        <KB kind="research" label="Research link">
          These are exactly the trade-offs the <Link to="/power">Statistical Power</Link> and <Link to="/suspension">Rigor Monitor</Link> tools surface for the BrS-EPI cohort.
        </KB>
      </>
    ),
  },
  {
    id: 'controversies',
    group: 'Research frontier',
    title: 'Open questions & controversies',
    body: (
      <>
        <ul>
          <li><b>Depolarization vs repolarization</b> — one, the other, or a per-patient spectrum?</li>
          <li><b>Genetic architecture</b> — is SCN5A causal or a modifier on a polygenic background?</li>
          <li><b>Is BrS structural?</b> — the RVOT-fibrosis / "concealed cardiomyopathy" debate.</li>
          <li><b>Risk stratification</b> — the value and reproducibility of EP-study programmed stimulation, and how to manage the asymptomatic spontaneous type-1.</li>
          <li><b>Ablation</b> — durability and its place in the treatment ladder.</li>
          <li><b>Epigenetics & penetrance</b> — do methylation / chromatin states explain why carriers diverge? <i>(Open — the BrS-EPI question.)</i></li>
        </ul>
      </>
    ),
  },
  {
    id: 'milestones',
    group: 'Research frontier',
    title: 'Milestones & references',
    body: (
      <>
        <p>Landmark points in the BrS story (descriptive — verify exact citations before use):</p>
        <ul>
          <li>Long-standing description of <b>SUNDS</b> in Southeast/East Asia.</li>
          <li><b>1992</b> — Brugada &amp; Brugada, the defining clinical report.</li>
          <li><b>1998</b> — <b>SCN5A</b> as the first BrS gene (Chen et&nbsp;al.).</li>
          <li>Antzelevitch and colleagues — the <b>repolarization / phase-2 re-entry</b> mechanism in wedge preparations.</li>
          <li><b>2011</b> — Nademanee et&nbsp;al., <b>epicardial RVOT substrate ablation</b>.</li>
          <li><b>2013</b> — Bezzina et&nbsp;al. GWAS implicating the <b>SCN5A–SCN10A</b> and <b>HEY2</b> loci.</li>
          <li><b>2013 / 2015 / 2016</b> — HRS/EHRA/APHRS consensus, ESC guidelines, and the <b>Shanghai score</b>.</li>
          <li><b>2018</b> — ClinGen gene-curation reappraisal (SCN5A definitive).</li>
        </ul>
        <KB kind="hy" label="Resource">
          Keep <b>brugadadrugs.org</b> to hand for the up-to-date "drugs to avoid" lists.
        </KB>
      </>
    ),
  },
]
