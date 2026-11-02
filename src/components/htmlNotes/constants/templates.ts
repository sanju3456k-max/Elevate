// Built-in starter template: Module 1 — Set Cardinality & Countability (Production Academic Template)
export const TEMPLATE_MATRICES = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Deep Dive: Module 1 — Set Cardinality & Countability</title>
    <!-- Google Fonts: Inter & Fira Code -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <!-- KaTeX CSS -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
    
    <!-- KaTeX JS & Auto-render extension -->
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body);"></script>

    <style>
        :root {
            --primary-color: #1e3a8a;
            --secondary-color: #0284c7;
            --accent-color: #f59e0b;
            --background-color: #f8fafc;
            --card-background: #ffffff;
            --text-color: #1e293b;
            --border-color: #e2e8f0;
            --table-header-bg: #1e3a8a;
            --table-header-color: #ffffff;
            --table-alt-bg: #f1f5f9;
        }

        @page {
            size: A4 portrait;
            margin: 10mm 10mm;
        }

        * {
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-weight: 500;
            background-color: var(--background-color);
            color: var(--text-color);
            line-height: 1.5;
            margin: 0;
            padding: 0.5rem;
            width: 100%;
            max-width: 92rem;
            margin-left: auto;
            margin-right: auto;
        }

        @media (min-width: 768px) {
            body {
                padding: 1rem;
            }
        }

        @media (min-width: 1024px) {
            body {
                padding: 2rem;
            }
        }

        /* --- Optimized Multi-Device Grid Flow (Mobile: 1 Col -> Tablet/Desktop: 2 Col) --- */
        .notes-layout {
            display: grid;
            grid-template-columns: 1fr;
            gap: 1rem;
        }

        @media (min-width: 768px) {
            .notes-layout {
                grid-template-columns: repeat(2, 1fr);
                gap: 1.25rem;
            }
            .full-width {
                grid-column: span 2;
            }
        }

        @media (min-width: 1024px) {
            .notes-layout {
                gap: 1.5rem;
            }
        }

        /* --- Container Query Fluid Flow for Embedded Preview and Responsive Split View --- */
        @container (max-width: 600px) {
            .notes-layout {
                grid-template-columns: 1fr !important;
                gap: 1rem !important;
            }
            .full-width {
                grid-column: span 1 !important;
            }
            .section-card {
                width: 100% !important;
                margin-right: 0 !important;
            }
        }

        @container (min-width: 601px) {
            .notes-layout {
                grid-template-columns: repeat(2, 1fr);
                gap: 1.25rem;
            }
            .full-width {
                grid-column: span 2;
            }
        }

        /* Clean Section block without white card background */
        .section-card {
            background: transparent;
            padding: 0;
            border: none;
            box-shadow: none;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            page-break-inside: auto;
            break-inside: auto;
        } 

        .header-plain {
            padding: 0.25rem;
            display: flex;
            flex-direction: column;
            gap: 0.375rem;
            page-break-after: avoid;
            break-after: avoid;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        .module-header {
            border-bottom: 0.125rem solid var(--secondary-color);
            padding-bottom: 0.375rem;
            margin-top: 0;
            margin-bottom: 0.25rem;
            page-break-after: avoid;
            break-after: avoid;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        h1 {
            color: var(--primary-color);
            font-size: clamp(1.35rem, 3vw, 1.85rem);
            margin: 0;
            font-weight: 700;
            letter-spacing: -0.025em;
            page-break-after: avoid;
            break-after: avoid;
        }

        h2 {
            color: var(--secondary-color);
            font-size: clamp(1.05rem, 2vw, 1.25rem);
            margin: 0 0 0.5rem 0;
            border-bottom: 0.0625rem solid var(--border-color);
            padding-bottom: 0.25rem;
            font-weight: 700;
            page-break-after: avoid;
            break-after: avoid;
        }

        ul {
            list-style-type: none;
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 0.375rem;
        }

        li {
            background: var(--table-alt-bg);
            padding: 0.35rem 0.65rem;
            border-radius: 0.3125rem;
            border-left: 0.2rem solid var(--secondary-color);
            word-break: break-word;
            page-break-inside: avoid;
            break-inside: avoid;
            font-size: 0.86rem;
            line-height: 1.4;
        }

        .definition-term {
            font-weight: 600;
            color: var(--primary-color);
        }

        strong {
            font-weight: 600;
        }

        p {
            margin: 0.375rem 0;
            orphans: 2;
            widows: 2;
        }

        @media (min-width: 768px) {
            p {
                margin: 0.5rem 0;
            }
        }

        /* --- Responsive Touch-Friendly Table Layout --- */
        .table-wrapper {
            width: 100%;
            max-width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            margin: 0.25rem 0;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            box-sizing: border-box;
            scrollbar-width: thin;
            page-break-inside: auto;
            break-inside: auto;
        }

        table.classified-table {
            width: 100% !important;
            max-width: 100%;
            border-collapse: collapse;
            text-align: left;
            background: var(--card-background) !important;
            min-width: 100%;
            table-layout: auto;
            border-radius: 0.375rem;
            border: 1.04px solid var(--border-color);
            page-break-inside: auto;
            break-inside: auto;
        }

        @media (min-width: 768px) {
            table.classified-table {
                min-width: 36rem;
            }
        }

        thead {
            display: table-header-group;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        tr {
            page-break-inside: avoid;
            break-inside: avoid;
        }

        table.classified-table th {
            background-color: var(--table-header-bg);
            color: var(--table-header-color);
            padding: 0.35rem 0.5rem;
            font-size: 0.84rem;
            font-weight: 600;
            border: 1.04px solid var(--table-header-bg);
        }

        table.classified-table td {
            padding: 0.35rem 0.5rem;
            border: 1.04px solid var(--border-color);
            vertical-align: middle;
            background: var(--card-background);
            font-size: 0.84rem;
            line-height: 1.38;
        }

        table.classified-table tr:nth-child(even) td {
            background-color: var(--table-alt-bg);
        }

        /* --- Production Print Flow (Eliminates Blank Space & Forced Page Push) --- */
        @media print {
            body {
                background: #ffffff !important;
                padding: 0 !important;
                max-width: 100% !important;
                font-size: 9.5pt;
                line-height: 1.45;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .notes-layout {
                display: grid !important;
                grid-template-columns: repeat(2, 1fr) !important;
                gap: 1rem !important;
                width: 100% !important;
            }
            .full-width {
                grid-column: span 2 !important;
                width: 100% !important;
            }
            .section-card {
                break-inside: auto !important;
                page-break-inside: auto !important;
                margin-bottom: 0.5rem !important;
                width: 100% !important;
            }
            .section-card:not(.full-width) {
                grid-column: span 1 !important;
                width: 100% !important;
                margin: 0 !important;
            }
            .table-wrapper {
                overflow: visible !important;
                margin: 0.35rem 0 !important;
            }
            table.classified-table {
                min-width: 100% !important;
                width: 100% !important;
                break-inside: auto !important;
                page-break-inside: auto !important;
            }
            thead {
                display: table-header-group !important;
            }
            tr {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
            h1, h2, .module-header {
                break-after: avoid !important;
                page-break-after: avoid !important;
            }
            li {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
        }
    </style>
</head>
<body>

    <div class="notes-layout">

        <!-- HEADER -->
        <div class="header-plain full-width">
            <div class="module-header" style="border-bottom: 0.1875rem solid var(--primary-color);">
                <h1 data-note-id="head_mod1">Deep Dive: Module 1 — Set Cardinality &amp; Countability</h1>
            </div>
        </div>

        <!-- SECTION 1 -->
        <div class="section-card full-width">
            <div class="module-header">
                <h2 data-note-id="head_sec1">1. Mathematical Definitions &amp; Fundamental Concepts</h2>
            </div>
            <div class="table-wrapper">
                <table data-note-id="block_sec1_table" class="classified-table">
                    <thead>
                        <tr>
                            <th style="width: 25%;">Term / Concept</th>
                            <th style="width: 45%;">Precise Definition &amp; Conditions</th>
                            <th style="width: 30%;">Key Properties / Mathematical Notation</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>Countable Set</strong></td>
                            <td>A set \\(S\\) is defined as countable if it satisfies one of three conditions:<br>1. \\(S = \\emptyset\\) (Empty set).<br>2. \\(S\\) is a finite set.<br>3. \\(S\\) is a countably infinite set.</td>
                            <td>Covers both finite and countably infinite sets.</td>
                        </tr>
                        <tr>
                            <td><strong>Countably Infinite (Denumerable) Set</strong></td>
                            <td>An infinite set \\(S\\) is countably infinite if it is in a one-to-one correspondence (bijective equivalence) with the set of natural numbers \\(\\mathbb{N}\\).</td>
                            <td>Written as \\(S \\sim \\mathbb{N}\\)<br>&bull; Cardinality: \\(|S| = |\\mathbb{N}| = \\aleph_0\\) (Aleph-null)</td>
                        </tr>
                        <tr>
                            <td><strong>Uncountable Set</strong></td>
                            <td>A set \\(S\\) is uncountable if it is not countable.</td>
                            <td>&bull; Cardinality Condition: \\(|S| > \\aleph_0\\)<br>&bull; Denoted as continuum cardinality \\(c = 2^{\\aleph_0}\\)</td>
                        </tr>
                        <tr>
                            <td><strong>Cardinal Equivalence</strong></td>
                            <td>Two sets \\(A\\) and \\(B\\) have the same cardinality if and only if there exists a bijective function between them.</td>
                            <td>\\(|A| = |B| \\iff \\exists f: A \\to B\\) that is both \\(1-1\\) (injective) and onto (surjective).</td>
                        </tr>
                        <tr>
                            <td><strong>Algebraic &amp; Transcendental</strong></td>
                            <td>&bull; <strong>Algebraic Number:</strong> Any real or complex number that is the root of a non-zero polynomial with rational coefficients.<br>&bull; <strong>Transcendental Number:</strong> Any real number that is not algebraic.</td>
                            <td>Classification of real/complex numbers based on polynomial roots.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- SECTION 2 -->
        <div class="section-card full-width">
            <div class="module-header">
                <h2 data-note-id="head_sec2">2. Injective &amp; Surjective Mapping Principles</h2>
            </div>
            <div class="table-wrapper">
                <table data-note-id="block_sec2_table" class="classified-table">
                    <thead>
                        <tr>
                            <th style="width: 25%;">Theorem / Principle</th>
                            <th style="width: 35%;">Core Definition &amp; Mapping Condition</th>
                            <th style="width: 40%;">Implications, Results &amp; Mastery Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>Theorem (Injective Bound)</strong></td>
                            <td>Let \\(A\\) and \\(B\\) be sets, and let \\(f: A \\to B\\) be a \\(1-1\\) (injective) function.</td>
                            <td>&bull; Implication: \\(|A| \\le |B|\\).<br>&bull; Result 1: If \\(B\\) is countable, then \\(A\\) MUST be countable.<br>&bull; Result 2: If \\(A\\) is uncountable, then \\(B\\) MUST be uncountable.<br>&bull; <strong>Mastery Point (Converse Failure):</strong> If \\(A\\) is countable, \\(B\\) is not guaranteed to be countable; if \\(B\\) is uncountable, \\(A\\) is not guaranteed to be uncountable.</td>
                        </tr>
                        <tr>
                            <td><strong>Theorem (Surjective Bound)</strong></td>
                            <td>Let \\(f: A \\to B\\) be an onto (surjective) function.</td>
                            <td>&bull; Implication: If \\(A\\) is countable, then \\(B\\) MUST be countable.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- SECTION 3: TAXONOMY TABLE -->
        <div class="section-card full-width">
            <div class="module-header">
                <h2 data-note-id="head_sec3">3. Comprehensive Taxonomy of Standard Sets</h2>
            </div>
            <div class="table-wrapper">
                <table data-note-id="block_taxonomy" class="classified-table">
                    <thead>
                        <tr>
                            <th style="width: 35%;">Set Description</th>
                            <th style="width: 20%;">Symbol</th>
                            <th style="width: 20%;">Cardinality</th>
                            <th style="width: 25%;">Classification</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>Empty Set</strong></td>
                            <td>$\\emptyset$</td>
                            <td>$0$</td>
                            <td>Countable (Finite)</td>
                        </tr>
                        <tr>
                            <td><strong>Natural Numbers</strong></td>
                            <td>$\\mathbb{N}$</td>
                            <td>$\\aleph_0$</td>
                            <td>Countably Infinite</td>
                        </tr>
                        <tr>
                            <td><strong>Whole Numbers</strong></td>
                            <td>$\\mathbb{W}$</td>
                            <td>$\\aleph_0$</td>
                            <td>Countably Infinite</td>
                        </tr>
                        <tr>
                            <td><strong>Integers</strong></td>
                            <td>$\\mathbb{Z}$</td>
                            <td>$\\aleph_0$</td>
                            <td>Countably Infinite</td>
                        </tr>
                        <tr>
                            <td><strong>Rational Numbers</strong></td>
                            <td>$\\mathbb{Q}$</td>
                            <td>$\\aleph_0$</td>
                            <td>Countably Infinite</td>
                        </tr>
                        <tr>
                            <td><strong>Algebraic Numbers</strong></td>
                            <td>$\\mathbb{A}$</td>
                            <td>$\\aleph_0$</td>
                            <td>Countably Infinite</td>
                        </tr>
                        <tr>
                            <td><strong>Prime Numbers</strong></td>
                            <td>$\\mathbb{P}$</td>
                            <td>$\\aleph_0$</td>
                            <td>Countably Infinite</td>
                        </tr>
                        <tr>
                            <td><strong>Sequence Ranges</strong></td>
                            <td>$\\{a_n\\}$</td>
                            <td>$\\le \\aleph_0$</td>
                            <td>Countable</td>
                        </tr>
                        <tr>
                            <td><strong>Real Numbers</strong></td>
                            <td>$\\mathbb{R}$</td>
                            <td>$c = 2^{\\aleph_0}$</td>
                            <td>Uncountable</td>
                        </tr>
                        <tr>
                            <td><strong>Irrational Numbers</strong></td>
                            <td>$\\mathbb{Q}^c \\text{ or } \\mathbb{I}$</td>
                            <td>$c = 2^{\\aleph_0}$</td>
                            <td>Uncountable</td>
                        </tr>
                        <tr>
                            <td><strong>Transcendental Numbers</strong></td>
                            <td>$\\mathbb{T}$</td>
                            <td>$c = 2^{\\aleph_0}$</td>
                            <td>Uncountable</td>
                        </tr>
                        <tr>
                            <td><strong>Intervals (Open/Closed/Semi)</strong></td>
                            <td>$(a,b), [a,b]$</td>
                            <td>$c = 2^{\\aleph_0}$</td>
                            <td>Uncountable</td>
                        </tr>
                        <tr>
                            <td><strong>Power Set of Natural Numbers</strong></td>
                            <td>$2^\\mathbb{N}$</td>
                            <td>$c = 2^{\\aleph_0}$</td>
                            <td>Uncountable</td>
                        </tr>
                        <tr>
                            <td><strong>Power Sets of Infinite Sets</strong></td>
                            <td>$2^\\mathbb{Q}, 2^\\mathbb{R}, 2^\\mathbb{C}$</td>
                            <td>$> \\aleph_0$</td>
                            <td>Uncountable</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- SECTION 4 -->
        <div class="section-card full-width">
            <div class="module-header">
                <h2 data-note-id="head_sec4">4. Fundamental Theorems &amp; Structural Algebra</h2>
            </div>
            <div class="table-wrapper">
                <table data-note-id="block_sec4_table" class="classified-table">
                    <thead>
                        <tr>
                            <th style="width: 25%;">Structural Category</th>
                            <th style="width: 45%;">Theorem / Principle</th>
                            <th style="width: 30%;">Mathematical Formulations &amp; Examples</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>A. Subset &amp; Superset Theorems</strong></td>
                            <td>&bull; <strong>Theorem (Subset Rule):</strong> Every subset of a countable set is countable.<br>&bull; <strong>Theorem (Superset Rule):</strong> Every superset of an uncountable set is uncountable.</td>
                            <td>Relates cardinality bounds between sets and their subsets/supersets.</td>
                        </tr>
                        <tr>
                            <td><strong>B. Union &amp; Difference Theorems</strong></td>
                            <td>&bull; <strong>Theorem (Countable Union):</strong> Countable union of countable sets is countable.<br>&bull; <strong>Theorem (Union with Uncountable):</strong> Countable \\(\\cup\\) Uncountable is uncountable.<br>&bull; <strong>Theorem (Set Difference):</strong> Uncountable \\(\\setminus\\) Countable is uncountable.</td>
                            <td>Example: \\(\\mathbb{R} \\setminus \\mathbb{Q} = \\mathbb{Q}^c\\) (Irrational numbers are uncountable).</td>
                        </tr>
                        <tr>
                            <td><strong>C. Product Theorems</strong></td>
                            <td>&bull; Cartesian product of two countable sets is countable.<br>&bull; Infinite Cartesian product of non-singleton finite sets is uncountable.</td>
                            <td>Expressed notationally as \\(\\prod_{i=1}^\\infty A_i\\).</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- SECTION 5 -->
        <div class="section-card">
            <div class="module-header">
                <h2 data-note-id="head_sec5">5. Function Spaces &amp; Power Sets</h2>
            </div>
            <ul>
                <li><span class="definition-term">Function Set Cardinality:</span> For $S = \\{f \\mid f: A \\to B\\}$, total functions = $|B|^{|A|}$.<br>&bull; $f: \\mathbb{N} \\to \\{0,1\\}$ has cardinality $2^{\\aleph_0} = c$ (Uncountable).<br>&bull; $f: \\{0,1\\} \\to \\mathbb{N}$ has cardinality $\\aleph_0^2 = \\aleph_0$ (Countably Infinite).</li>
                <li><span class="definition-term">Power Set Theorems:</span> $P(\\emptyset)$ is finite, $P(\\mathbb{N})$ is uncountable. No set has a power set of cardinality $\\aleph_0$. Finite subsets of $\\mathbb{N}$ are countable, while arbitrary subsets ($P(\\mathbb{N})$) are uncountable.</li>
            </ul>
        </div>

        <!-- SECTION 6 -->
        <div class="section-card">
            <div class="module-header">
                <h2 data-note-id="head_sec6">6. Exam Recognition Patterns &amp; Shortcut Tricks</h2>
            </div>
            <ul>
                <li><span class="definition-term">Recognition Pattern 1 (\\(\\mathbb{R}^n\\) Algebraic Constraints):</span> Sets defined by linear constraints in rational coordinates are subsets of $\\mathbb{Q}^n$ (countable); continuous real equations in $\\mathbb{R}^2$ or $\\mathbb{R}^n$ form continuum lines (uncountable).</li>
                <li><span class="definition-term">Recognition Pattern 2 (Recurring Decimals vs Irrational Constants):</span> Recurring decimals form subsets of $\\mathbb{Q}$ (countable). Primes mapping $\\mathbb{P} \\times \\mathbb{P}$ form countable sets.</li>
            </ul>
        </div>

        <!-- SECTION 7: MATRIX TABLE -->
        <div class="section-card full-width">
            <div class="module-header">
                <h2 data-note-id="head_sec7">7. Compact Revision Matrix: Module 1 Operations</h2>
            </div>
            <div class="table-wrapper">
                <table data-note-id="block_matrix" class="classified-table">
                    <thead>
                        <tr>
                            <th style="width: 25%;">Operation / Expression</th>
                            <th style="width: 30%;">Conditions</th>
                            <th style="width: 25%;">Resulting Cardinality</th>
                            <th style="width: 20%;">Source Reference</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>$A \\cup B$</td>
                            <td>$A, B$ countable</td>
                            <td>Countable</td>
                            <td>Standard Union</td>
                        </tr>
                        <tr>
                            <td>$A \\cup B$</td>
                            <td>$A$ countable, $B$ uncountable</td>
                            <td>Uncountable</td>
                            <td>Mixed Union</td>
                        </tr>
                        <tr>
                            <td>$A \\cap B$</td>
                            <td>$A, B$ countable</td>
                            <td>Countable</td>
                            <td>Intersection Rule</td>
                        </tr>
                        <tr>
                            <td>$A \\times B$</td>
                            <td>$A, B$ countable</td>
                            <td>Countable</td>
                            <td>Cartesian Product</td>
                        </tr>
                        <tr>
                            <td>$\\prod_{i=1}^n A_i$</td>
                            <td>$n \\in \\mathbb{N}, A_i \\text{ countable}$</td>
                            <td>Countable</td>
                            <td>Finite Product</td>
                        </tr>
                        <tr>
                            <td>$\\prod_{i=1}^\\infty A_i$</td>
                            <td>$|A_i| \\ge 2$</td>
                            <td>Uncountable</td>
                            <td>Infinite Product</td>
                        </tr>
                        <tr>
                            <td>$A \\setminus B$</td>
                            <td>$A \\text{ uncountable}, B \\text{ countable}$</td>
                            <td>Uncountable</td>
                            <td>Set Difference</td>
                        </tr>
                        <tr>
                            <td>$f: A \\to B ; (1-1)$</td>
                            <td>$B$ countable</td>
                            <td>$A$ is Countable</td>
                            <td>Injective Bound</td>
                        </tr>
                        <tr>
                            <td>$f: A \\to B ; (1-1)$</td>
                            <td>$A$ uncountable</td>
                            <td>$B$ is Uncountable</td>
                            <td>Injective Bound</td>
                        </tr>
                        <tr>
                            <td>$B^A$</td>
                            <td>$|A|=\\aleph_0, |B|=2$</td>
                            <td>Uncountable $(2^{\\aleph_0})$</td>
                            <td>Function Space</td>
                        </tr>
                        <tr>
                            <td>$B^A$</td>
                            <td>$|A|=2, |B|=\\aleph_0$</td>
                            <td>Countable $(\\aleph_0^2)$</td>
                            <td>Function Space</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

    </div>

</body>
</html>
`;

export const TEMPLATE_LANDSCAPE_SLIDES = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>A4 Widescreen Slide Deck Reference</title>
    <style>
        :root {
            --primary: #2563eb;
            --primary-dark: #1d4ed8;
            --primary-light: #eff6ff;
            --primary-border: #bfdbfe;
            --accent: #0f172a;
            --success: #10b981;
            --warning: #f59e0b;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --bg-body: #f8fafc;
            --bg-card: #ffffff;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: var(--bg-body);
            color: var(--text-main);
            line-height: 1.5;
            padding: 12px;
        }

        /* Slide Deck Container */
        .slide {
            background: var(--bg-card);
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 24px 28px;
            margin-bottom: 24px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.06);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 675px;
            aspect-ratio: 16 / 9;
            page-break-after: always;
            break-after: page;
        }

        .slide-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid var(--primary-border);
            padding-bottom: 12px;
            margin-bottom: 16px;
        }

        .slide-header h1 {
            color: var(--primary);
            font-size: 1.6rem;
            font-weight: 800;
            letter-spacing: -0.02em;
        }

        .slide-badge {
            background: var(--primary-light);
            color: var(--primary-dark);
            border: 1px solid var(--primary-border);
            font-size: 0.75rem;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 9999px;
            text-transform: uppercase;
        }

        .slide-body {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 14px;
        }

        .slide-footer {
            margin-top: 16px;
            padding-top: 10px;
            border-top: 1px dashed #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.8rem;
            color: var(--text-muted);
        }

        /* Grid Layouts */
        .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }

        .grid-3 {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 14px;
        }

        /* Cards & Metric Panels */
        .metric-card {
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            padding: 14px;
            text-align: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.02);
        }

        .metric-val {
            font-size: 1.8rem;
            font-weight: 800;
            color: var(--primary);
            line-height: 1.1;
        }

        .metric-lbl {
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--text-muted);
            margin-top: 4px;
            text-transform: uppercase;
        }

        .panel {
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-left: 4px solid var(--primary);
            border-radius: 8px;
            padding: 14px;
            display: flow-root;
        }

        .panel-success { border-left-color: var(--success); background-color: #f0fdf4; }
        .panel-warning { border-left-color: var(--warning); background-color: #fffbeb; }

        /* Tables */
        table {
            width: 100%;
            border-collapse: collapse;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #cbd5e1;
            font-size: 0.88rem;
        }

        th, td {
            padding: 10px 14px;
            border: 1px solid #e2e8f0;
            text-align: left;
        }

        th {
            background-color: var(--primary-light);
            color: var(--primary-dark);
            font-weight: 700;
        }

        tr:nth-child(even) {
            background-color: #f8fafc;
        }

        /* Code Blocks */
        pre {
            background: #0f172a;
            color: #f8fafc;
            padding: 14px;
            border-radius: 8px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 0.85rem;
            overflow-x: auto;
            border: 1px solid #334155;
        }

        .tag-pill {
            display: inline-block;
            background: #e2e8f0;
            color: #334155;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-right: 4px;
        }

        /* Checklists */
        .task-list {
            list-style: none;
            padding: 0;
        }

        .task-list li {
            padding: 8px 12px;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            margin-bottom: 6px;
            background: #ffffff;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.9rem;
        }

        .task-list input[type="checkbox"] {
            width: 16px;
            height: 16px;
            accent-color: var(--primary);
        }

        @page { size: A4 landscape; margin: 0; }
        @media print {
            body { background: white !important; padding: 0 !important; }
            .slide {
                box-shadow: none !important;
                border: none !important;
                border-radius: 0 !important;
                margin: 0 !important;
                width: 297mm !important;
                height: 210mm !important;
                padding: 18mm 20mm !important;
                break-after: page !important;
                page-break-after: always !important;
            }
        }
    </style>
</head>
<body>

    <!-- SLIDE 1 -->
    <div class="slide">
        <div class="slide-header">
            <div>
                <h1>A4 Widescreen Slide Deck Reference</h1>
                <p style="color: #64748b; font-size: 0.88rem; font-weight: 500;">Interactive 16:9 Landscape Note Template for Notes Studio</p>
            </div>
            <span class="slide-badge">Slide 01 / 04</span>
        </div>

        <div class="slide-body">
            <div class="grid-3">
                <div class="metric-card">
                    <div class="metric-val">100%</div>
                    <div class="metric-lbl">A4 Landscape Match</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val">16 : 9</div>
                    <div class="metric-lbl">Widescreen Layout</div>
                </div>
                <div class="metric-card">
                    <div class="metric-val">0 Cutoff</div>
                    <div class="metric-lbl">Zero Content Clipping</div>
                </div>
            </div>

            <div class="grid-2" style="margin-top: 8px;">
                <div class="panel">
                    <h3 style="color: #2563eb; font-size: 1rem; margin-bottom: 6px;">Key Strategic Advantages</h3>
                    <ul style="padding-left: 18px; font-size: 0.88rem; color: #334155; line-height: 1.6;">
                        <li><strong>Full Width Utilization:</strong> Utilizes full 297mm width of A4 paper in landscape mode.</li>
                        <li><strong>Structured Elements:</strong> Resizable tables, callouts, and code blocks fit without awkward line wrapping.</li>
                        <li><strong>Zero Overflow:</strong> Each slide is rendered as a clean, self-contained presentation card.</li>
                    </ul>
                </div>

                <div class="panel panel-success">
                    <h3 style="color: #059669; font-size: 1rem; margin-bottom: 6px;">Interactive Editing Features</h3>
                    <ul style="padding-left: 18px; font-size: 0.88rem; color: #334155; line-height: 1.6;">
                        <li><strong>Font Scaling (A+ / A-):</strong> Select any element to scale font size up or down.</li>
                        <li><strong>Slide Transport:</strong> Instantly move tables or blocks to the Next or Previous slide.</li>
                        <li><strong>Drag-to-Resize:</strong> Live handles for adjusting table columns and callout boxes.</li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="slide-footer">
            <span>Notes Studio · 16:9 Landscape Reference</span>
            <span>Page 1 of 4</span>
        </div>
    </div>

    <!-- SLIDE 2 -->
    <div class="slide">
        <div class="slide-header">
            <div>
                <h1>Data Matrix & Operational Metrics</h1>
                <p style="color: #64748b; font-size: 0.88rem; font-weight: 500;">Formatted performance table and highlights</p>
            </div>
            <span class="slide-badge">Slide 02 / 04</span>
        </div>

        <div class="slide-body">
            <table>
                <thead>
                    <tr>
                        <th>Performance Metric</th>
                        <th>Target Q1</th>
                        <th>Actual Q1</th>
                        <th>Variance</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Page Load Velocity</strong></td>
                        <td>&lt; 300 ms</td>
                        <td>180 ms</td>
                        <td style="color: #059669; font-weight: 700;">+40% Fast</td>
                        <td><span class="tag-pill" style="background: #dcfce7; color: #166534;">Optimal</span></td>
                    </tr>
                    <tr>
                        <td><strong>Print Accuracy Score</strong></td>
                        <td>98.0%</td>
                        <td>99.9%</td>
                        <td style="color: #059669; font-weight: 700;">+1.9%</td>
                        <td><span class="tag-pill" style="background: #dcfce7; color: #166534;">Verified</span></td>
                    </tr>
                    <tr>
                        <td><strong>Slide Alignment Ratio</strong></td>
                        <td>16:9 Ratio</td>
                        <td>16:9 Widescreen</td>
                        <td style="color: #2563eb; font-weight: 700;">Exact</td>
                        <td><span class="tag-pill" style="background: #dbeafe; color: #1e40af;">Standard</span></td>
                    </tr>
                    <tr>
                        <td><strong>Export Render Time</strong></td>
                        <td>&lt; 1.5s</td>
                        <td>0.8s</td>
                        <td style="color: #059669; font-weight: 700;">-0.7s</td>
                        <td><span class="tag-pill" style="background: #dcfce7; color: #166534;">Instant</span></td>
                    </tr>
                </tbody>
            </table>

            <div class="panel panel-warning" style="margin-top: 10px;">
                <strong style="color: #d97706; font-size: 0.95rem;">Operational Summary:</strong>
                <p style="font-size: 0.88rem; color: #451a03; margin-top: 4px;">
                    All 16:9 slides automatically maintain landscape page boundary compliance during PDF print generation. Click table cells to edit or drag edge handles to adjust column widths.
                </p>
            </div>
        </div>

        <div class="slide-footer">
            <span>Notes Studio · Performance Audit</span>
            <span>Page 2 of 4</span>
        </div>
    </div>

    <!-- SLIDE 3 -->
    <div class="slide">
        <div class="slide-header">
            <div>
                <h1>Technical Architecture & Code Snippets</h1>
                <p style="color: #64748b; font-size: 0.88rem; font-weight: 500;">Implementation code and formulas</p>
            </div>
            <span class="slide-badge">Slide 03 / 04</span>
        </div>

        <div class="slide-body">
            <div class="grid-2">
                <div>
                    <h3 style="font-size: 0.95rem; color: #0f172a; margin-bottom: 8px;">CSS Print Engine Configuration</h3>
                    <pre><code>@page {
  size: A4 landscape !important;
  margin: 0 !important;
}

@media print {
  .slide {
    width: 297mm !important;
    height: 210mm !important;
    break-after: page !important;
    page-break-after: always !important;
  }
}</code></pre>
                </div>

                <div class="panel">
                    <h3 style="font-size: 0.95rem; color: #2563eb; margin-bottom: 6px;">KaTeX Mathematical Proofs</h3>
                    <p style="font-size: 0.85rem; color: #334155;">Matrix Transformations for 16:9 scaling:</p>
                    <p style="text-align: center; margin: 12px 0; font-size: 1.1rem;">
                        $$\mathbf{S} = \begin{pmatrix} s_x & 0 \\ 0 & s_y \end{pmatrix}, \quad \text{where } \frac{s_x}{s_y} = \frac{16}{9}$$
                    </p>
                    <p style="font-size: 0.82rem; color: #64748b;">
                        Ensures aspect ratio preservation across both screen display and landscape A4 print outputs.
                    </p>
                </div>
            </div>
        </div>

        <div class="slide-footer">
            <span>Notes Studio · System Design</span>
            <span>Page 3 of 4</span>
        </div>
    </div>

    <!-- SLIDE 4 -->
    <div class="slide">
        <div class="slide-header">
            <div>
                <h1>Execution Roadmap & Verification Checklist</h1>
                <p style="color: #64748b; font-size: 0.88rem; font-weight: 500;">Action items for slide deck completion</p>
            </div>
            <span class="slide-badge">Slide 04 / 04</span>
        </div>

        <div class="slide-body">
            <ul class="task-list">
                <li>
                    <input type="checkbox" checked disabled>
                    <span><strong>16:9 Slide Deck Viewport:</strong> Default mode activated across Notes Studio workspace.</span>
                </li>
                <li>
                    <input type="checkbox" checked disabled>
                    <span><strong>A4 Landscape Print Engine:</strong> Standard @page setup configured for full 297mm x 210mm pages.</span>
                </li>
                <li>
                    <input type="checkbox" checked disabled>
                    <span><strong>Interactive Element Editing:</strong> Floating toolbar added for font scaling (A+/A-) and slide transport.</span>
                </li>
                <li>
                    <input type="checkbox" checked disabled>
                    <span><strong>Reference Sample Template:</strong> Rich, perfectly filled 4-slide note loaded for instant reference.</span>
                </li>
            </ul>

            <div class="panel panel-success" style="margin-top: 10px;">
                <strong style="color: #059669;">Ready for Export:</strong>
                <p style="font-size: 0.88rem; color: #064e3b; margin-top: 2px;">
                    Click the <strong>Print / Export PDF</strong> button in the top toolbar to output these slides as an exact A4 Landscape document!
                </p>
            </div>
        </div>

        <div class="slide-footer">
            <span>Notes Studio · Final Summary</span>
            <span>Page 4 of 4</span>
        </div>
    </div>
</body>
</html>`;

// Default New Academic Note Template with Responsive Flow & KaTeX Integration

// Default New Academic Note Template with Responsive Flow & KaTeX Integration
export const createNewNoteTemplate = (title: string) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <!-- Google Fonts: Inter & Fira Code -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <!-- KaTeX CSS -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
    
    <!-- KaTeX JS & Auto-render extension -->
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body);"></script>

    <style>
        :root {
            --primary-color: #1e3a8a;
            --secondary-color: #0284c7;
            --accent-color: #f59e0b;
            --background-color: #f8fafc;
            --card-background: #ffffff;
            --text-color: #1e293b;
            --border-color: #e2e8f0;
            --table-header-bg: #1e3a8a;
            --table-header-color: #ffffff;
            --table-alt-bg: #f1f5f9;
        }

        @page {
            size: A4 portrait;
            margin: 10mm 10mm;
        }

        * {
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-weight: 500;
            background-color: var(--background-color);
            color: var(--text-color);
            line-height: 1.5;
            margin: 0;
            padding: 0.5rem;
            width: 100%;
            max-width: 92rem;
            margin-left: auto;
            margin-right: auto;
        }

        @media (min-width: 600px) {
            body {
                padding: 1rem;
            }
        }

        @media (min-width: 1024px) {
            body {
                padding: 1.5rem;
            }
        }

        /* --- Multi-Device Grid Flow (Mobile: 1 Col -> Tablet/Desktop/Print: 2 Col) --- */
        .notes-layout {
            display: grid;
            grid-template-columns: 1fr;
            gap: 1rem;
        }

        @media (min-width: 600px) {
            .notes-layout {
                grid-template-columns: repeat(2, 1fr);
                gap: 1.25rem;
            }
            .full-width {
                grid-column: span 2;
            }
        }

        @container (max-width: 600px) {
            .notes-layout {
                grid-template-columns: 1fr !important;
                gap: 1rem !important;
            }
            .full-width {
                grid-column: span 1 !important;
            }
            .section-card {
                width: 100% !important;
                margin-right: 0 !important;
            }
        }

        @container (min-width: 601px) {
            .notes-layout {
                grid-template-columns: repeat(2, 1fr);
                gap: 1.25rem;
            }
            .full-width {
                grid-column: span 2;
            }
        }

        .section-card {
            background: transparent;
            padding: 0;
            border: none;
            box-shadow: none;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            page-break-inside: auto;
            break-inside: auto;
        } 

        .header-plain {
            padding: 0.25rem;
            display: flex;
            flex-direction: column;
            gap: 0.375rem;
            page-break-after: avoid;
            break-after: avoid;
        }

        .module-header {
            border-bottom: 0.125rem solid var(--secondary-color);
            padding-bottom: 0.375rem;
            margin-top: 0;
            margin-bottom: 0.25rem;
            page-break-after: avoid;
            break-after: avoid;
        }

        h1 {
            color: var(--primary-color);
            font-size: clamp(1.35rem, 3vw, 1.85rem);
            margin: 0;
            font-weight: 700;
            letter-spacing: -0.025em;
            page-break-after: avoid;
            break-after: avoid;
        }

        h2 {
            color: var(--secondary-color);
            font-size: clamp(1.05rem, 2vw, 1.25rem);
            margin: 0 0 0.5rem 0;
            border-bottom: 0.0625rem solid var(--border-color);
            padding-bottom: 0.25rem;
            font-weight: 700;
            page-break-after: avoid;
            break-after: avoid;
        }

        ul {
            list-style-type: none;
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 0.375rem;
        }

        li {
            background: var(--table-alt-bg);
            padding: 0.45rem 0.75rem;
            border-radius: 0.3125rem;
            border-left: 0.2rem solid var(--secondary-color);
            word-break: break-word;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        .definition-term {
            font-weight: 600;
            color: var(--primary-color);
        }

        strong {
            font-weight: 600;
        }

        p {
            margin: 0.375rem 0;
            orphans: 2;
            widows: 2;
        }

        .table-wrapper {
            width: 100%;
            max-width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            margin: 0.5rem 0;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            box-sizing: border-box;
            scrollbar-width: thin;
            page-break-inside: auto;
            break-inside: auto;
        }

        table.classified-table {
            width: 100% !important;
            max-width: 100%;
            border-collapse: collapse;
            text-align: left;
            background: var(--card-background) !important;
            min-width: 100%;
            table-layout: auto;
            border-radius: 0.375rem;
            border: 1.04px solid var(--border-color);
            page-break-inside: auto;
            break-inside: auto;
        }

        thead {
            display: table-header-group;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        tr {
            page-break-inside: avoid;
            break-inside: avoid;
        }

        table.classified-table th {
            background-color: var(--table-header-bg);
            color: var(--table-header-color);
            padding: 0.5rem 0.625rem;
            font-weight: 600;
            border: 1.04px solid var(--table-header-bg);
            word-break: break-word;
            overflow-wrap: break-word;
        }

        table.classified-table td {
            padding: 0.5rem 0.625rem;
            border: 1.04px solid var(--border-color);
            vertical-align: middle;
            background: var(--card-background);
            font-size: 0.88rem;
            line-height: 1.45;
            word-break: break-word;
            overflow-wrap: break-word;
        }

        table.classified-table tr:nth-child(even) td {
            background-color: var(--table-alt-bg);
        }

        /* --- Mobile Screen Optimization (Prevents Right-Side Clipping) --- */
        @media (max-width: 640px) {
            body {
                padding: 0.25rem 0.15rem;
                overflow-x: hidden;
            }
            .notes-layout {
                grid-template-columns: 1fr !important;
                gap: 0.75rem !important;
            }
            .full-width {
                grid-column: span 1 !important;
            }
            .table-wrapper {
                width: 100% !important;
                max-width: 100% !important;
                overflow-x: auto !important;
                -webkit-overflow-scrolling: touch !important;
                display: block !important;
                margin: 0.35rem 0 !important;
            }
            table.classified-table {
                min-width: 100% !important;
                width: 100% !important;
                table-layout: auto !important;
            }
            table.classified-table th,
            table.classified-table td {
                padding: 0.4rem 0.45rem !important;
                font-size: 0.8rem !important;
                line-height: 1.35 !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
            }
            table.classified-table th {
                font-size: 0.82rem !important;
            }
            li {
                padding: 0.35rem 0.5rem !important;
                font-size: 0.84rem !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
            }
            h1 {
                font-size: 1.3rem !important;
            }
            h2 {
                font-size: 1.05rem !important;
            }
        }

        /* --- Production Print Flow (Preserves 2-Column Side-by-Side Sections) --- */
        @media print {
            body {
                background: #ffffff !important;
                padding: 0 !important;
                max-width: 100% !important;
                font-size: 9.5pt;
                line-height: 1.45;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .notes-layout {
                display: grid !important;
                grid-template-columns: repeat(2, 1fr) !important;
                gap: 1rem !important;
                width: 100% !important;
            }
            .full-width {
                grid-column: span 2 !important;
                width: 100% !important;
            }
            .section-card {
                break-inside: auto !important;
                page-break-inside: auto !important;
                margin-bottom: 0.5rem !important;
                width: 100% !important;
            }
            .section-card:not(.full-width) {
                grid-column: span 1 !important;
                width: 100% !important;
                margin: 0 !important;
            }
            /* Fallback for unrolled sheets */
            body > .section-card:not(.full-width),
            .a4-sheet > .section-card:not(.full-width) {
                display: inline-block !important;
                width: calc(50% - 0.5rem) !important;
                vertical-align: top !important;
                margin-right: 0.5rem !important;
                box-sizing: border-box !important;
            }
            body > .section-card:not(.full-width):nth-of-type(even),
            .a4-sheet > .section-card:not(.full-width):nth-of-type(even) {
                margin-right: 0 !important;
            }
            .table-wrapper {
                overflow: visible !important;
                margin: 0.35rem 0 !important;
            }
            table.classified-table {
                min-width: 100% !important;
                width: 100% !important;
                break-inside: auto !important;
                page-break-inside: auto !important;
            }
            thead {
                display: table-header-group !important;
            }
            tr {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
            h1, h2, .module-header {
                break-after: avoid !important;
                page-break-after: avoid !important;
            }
            li {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
        }
    </style>
</head>
<body>

    <div class="notes-layout">

        <!-- HEADER -->
        <div class="header-plain full-width">
            <div class="module-header" style="border-bottom: 0.1875rem solid var(--primary-color);">
                <h1 data-note-id="head_title">${title}</h1>
            </div>
            <p style="color: #64748b; font-size: 0.88rem; margin: 0;">Comprehensive Academic Notes & Reference Matrix</p>
        </div>

        <!-- SECTION 1 -->
        <div class="section-card full-width">
            <div class="module-header">
                <h2 data-note-id="head_sec1">1. Fundamental Mathematical Concepts & Definitions</h2>
            </div>
            <div class="table-wrapper">
                <table data-note-id="block_sec1_table" class="classified-table">
                    <thead>
                        <tr>
                            <th style="width: 25%;">Term / Principle</th>
                            <th style="width: 45%;">Formal Definition & Conditions</th>
                            <th style="width: 30%;">Mathematical Notation & Examples</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>Linear Transformation</strong></td>
                            <td>A mapping $T: V \\to W$ satisfying $T(u + v) = T(u) + T(v)$ and $T(cu) = cT(u)$ for all vectors $u,v \\in V$ and scalar $c$.</td>
                            <td>$T(c_1 v_1 + c_2 v_2) = c_1 T(v_1) + c_2 T(v_2)$</td>
                        </tr>
                        <tr>
                            <td><strong>Eigenvalues & Eigenvectors</strong></td>
                            <td>Scalar $\\lambda$ and non-zero vector $v$ such that multiplying $A$ by $v$ only scales $v$.</td>
                            <td>$A v = \\lambda v \\iff \\det(A - \\lambda I) = 0$</td>
                        </tr>
                        <tr>
                            <td><strong>Matrix Invertibility</strong></td>
                            <td>Square matrix $A$ has inverse $A^{-1}$ if and only if determinant is non-zero.</td>
                            <td>$A A^{-1} = A^{-1} A = I \\iff \\det(A) \\neq 0$</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- SECTION 2 -->
        <div class="section-card">
            <div class="module-header">
                <h2 data-note-id="head_sec2">2. Key Properties & Theorems</h2>
            </div>
            <ul>
                <li><span class="definition-term">Rank-Nullity Theorem:</span> For any linear transformation $T: V \\to W$, $\\dim(\\operatorname{range}(T)) + \\dim(\\ker(T)) = \\dim(V)$.</li>
                <li><span class="definition-term">Determinant Product:</span> $\\det(AB) = \\det(A)\\det(B)$ and $\\det(A^{-1}) = \\frac{1}{\\det(A)}$.</li>
            </ul>
        </div>

        <!-- SECTION 3 -->
        <div class="section-card">
            <div class="module-header">
                <h2 data-note-id="head_sec3">3. Exam Recognition & Shortcut Takeaways</h2>
            </div>
            <ul>
                <li><span class="definition-term">Fast $2 \\times 2$ Inverse:</span> $A^{-1} = \\frac{1}{ad - bc} \\begin{bmatrix} d & -b \\\\ -c & a \\end{bmatrix}$. Swap diagonal entries, negate off-diagonal entries.</li>
                <li><span class="definition-term">Trace & Determinant:</span> $\\operatorname{tr}(A) = \\sum \\lambda_i$ and $\\det(A) = \\prod \\lambda_i$.</li>
            </ul>
        </div>

    </div>

</body>
</html>`;
};

