(function() {
    'use strict';

    const WORKER_URL = 'https://adaptedsolutionsco.com/api/audit';
    const LEAD_URL = 'https://adaptedsolutionsco.com/api/audit-lead';
    const PROXY_URL = 'https://api.allorigins.win/get?url=';

    const GRADE_LABELS = [
        [90, 'Excellent'],
        [75, 'Good'],
        [55, 'Needs work'],
        [35, 'Poor'],
        [0, 'Critical']
    ];

    const ISSUE_MAP = {
        hasJsonLd: 'No structured data \u2014 AI engines cannot identify your business type or services',
        hasOrgSchema: 'Missing Organization schema \u2014 AI doesn\'t know who you are',
        hasLlmsTxt: 'No llms.txt file \u2014 AI crawlers have no instructions for your site',
        hasFaqSchema: 'No FAQ schema \u2014 missing featured snippet and AI answer opportunities',
        hasMetaDescription: 'Meta description missing \u2014 AI uses this as the primary answer summary',
        hasCanonical: 'No canonical tag \u2014 duplicate content signals confuse AI indexing',
        h1Count: 'H1 tag issue \u2014 unclear primary topic signal for AI',
        hasServiceSchema: 'No Service schema \u2014 AI cannot identify your specific offerings',
        hasOpenGraph: 'No Open Graph tags \u2014 missing social and AI preview signals',
        hasEntityDefinition: 'Weak entity signals \u2014 AI cannot clearly identify your business',
        h2Count: 'Too few H2 headings \u2014 limited content structure for AI parsing',
        hasFaqContent: 'No FAQ content \u2014 missing common question/answer patterns',
        isHttps: 'Site not using HTTPS \u2014 security baseline not met',
        hasViewport: 'No viewport meta tag \u2014 mobile and crawl issues',
        hasSitemap: 'No sitemap detected \u2014 AI crawlers may miss pages',
        hasTitleTag: 'Missing or empty title tag \u2014 no primary page identity'
    };

    const ISSUE_PRIORITY = [
        'hasJsonLd', 'hasOrgSchema', 'hasLlmsTxt', 'hasFaqSchema',
        'hasMetaDescription', 'hasCanonical', 'h1Count', 'hasServiceSchema',
        'hasOpenGraph', 'hasEntityDefinition', 'h2Count', 'hasFaqContent',
        'isHttps', 'hasViewport', 'hasSitemap', 'hasTitleTag'
    ];

    const CATEGORIES = {
        structuredData: { label: 'Structured Data', checks: ['hasJsonLd', 'hasOrgSchema', 'hasFaqSchema', 'hasServiceSchema'] },
        geoSignals: { label: 'GEO Signals', checks: ['hasLlmsTxt', 'hasOpenGraph', 'hasEntityDefinition', 'hasCanonical'] },
        contentStructure: { label: 'Content Structure', checks: ['h1Count', 'h2Count', 'hasMetaDescription', 'hasFaqContent'] },
        technical: { label: 'Technical Baseline', checks: ['isHttps', 'hasViewport', 'hasSitemap', 'hasTitleTag'] }
    };

    const CHECK_LABELS = {
        hasJsonLd: 'JSON-LD present',
        hasOrgSchema: 'Organization schema',
        hasFaqSchema: 'FAQ schema',
        hasServiceSchema: 'Service schema',
        hasLlmsTxt: 'llms.txt file',
        hasOpenGraph: 'Open Graph tags',
        hasEntityDefinition: 'Entity definition',
        hasCanonical: 'Canonical tag',
        h1Count: 'Single H1 tag',
        h2Count: 'Multiple H2 tags',
        hasMetaDescription: 'Meta description',
        hasFaqContent: 'FAQ content',
        isHttps: 'HTTPS enabled',
        hasViewport: 'Viewport meta',
        hasSitemap: 'Sitemap',
        hasTitleTag: 'Title tag'
    };

    function normalizeUrl(input) {
        let url = input.trim();
        if (!url) return null;
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        try { new URL(url); return url; } catch(e) { return null; }
    }

    function getGradeLabel(score) {
        for (const [min, label] of GRADE_LABELS) {
            if (score >= min) return label;
        }
        return 'Critical';
    }

    function getScoreColor(score) {
        if (score >= 90) return '#4caf50';
        if (score >= 75) return '#5a9e6e';
        if (score >= 55) return '#d4a93a';
        if (score >= 35) return '#d4893a';
        return '#e05c5c';
    }

    function checkPass(key, value) {
        if (key === 'h1Count') return value === 1;
        if (key === 'h2Count') return value >= 2;
        return !!value;
    }

    function calcScores(checks) {
        function catScore(keys) {
            var passed = 0;
            keys.forEach(function(k) { if (checkPass(k, checks[k])) passed++; });
            return Math.round((passed / 4) * 100);
        }
        var sd = catScore(CATEGORIES.structuredData.checks);
        var geo = catScore(CATEGORIES.geoSignals.checks);
        var cs = catScore(CATEGORIES.contentStructure.checks);
        var tech = catScore(CATEGORIES.technical.checks);
        var aeo = Math.round((sd + cs) / 2);
        var geoScore = Math.round((geo * 0.6) + (sd * 0.4));
        var overall = Math.round((aeo + geoScore + tech) / 3);
        return { overall: overall, aeo: aeo, geo: geoScore, structuredData: sd, geoSignals: geo, contentStructure: cs, technical: tech };
    }

    function getTopIssues(checks) {
        var issues = [];
        for (var i = 0; i < ISSUE_PRIORITY.length && issues.length < 3; i++) {
            var key = ISSUE_PRIORITY[i];
            if (!checkPass(key, checks[key])) {
                issues.push({ key: key, message: ISSUE_MAP[key] });
            }
        }
        return issues;
    }

    function runClientSideChecks(html, url) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var text = html.toLowerCase();

        var jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
        var jsonLdText = '';
        jsonLdScripts.forEach(function(s) { jsonLdText += s.textContent; });

        var checks = {
            hasJsonLd: jsonLdScripts.length > 0,
            hasOrgSchema: /\"Organization\"|\"LocalBusiness\"/i.test(jsonLdText),
            hasFaqSchema: /\"FAQPage\"|\"Question\"/i.test(jsonLdText),
            hasServiceSchema: /\"Service\"/i.test(jsonLdText),
            hasLlmsTxt: null,
            hasOpenGraph: !!doc.querySelector('meta[property="og:title"]'),
            hasEntityDefinition: detectEntitySignals(doc, text),
            hasCanonical: !!doc.querySelector('link[rel="canonical"]'),
            h1Count: doc.querySelectorAll('h1').length,
            h2Count: doc.querySelectorAll('h2').length,
            hasMetaDescription: hasNonEmptyMeta(doc, 'description'),
            hasFaqContent: /faq|frequently asked/i.test(text),
            isHttps: /^https:\/\//i.test(url),
            hasViewport: !!doc.querySelector('meta[name="viewport"]'),
            hasSitemap: /sitemap\.xml/i.test(text),
            hasTitleTag: hasTitleContent(doc)
        };
        return checks;
    }

    function detectEntitySignals(doc, text) {
        var hasTitle = !!doc.querySelector('title');
        var hasMeta = !!doc.querySelector('meta[name="description"]');
        var hasH1 = doc.querySelectorAll('h1').length > 0;
        return hasTitle && hasMeta && hasH1;
    }

    function hasNonEmptyMeta(doc, name) {
        var meta = doc.querySelector('meta[name="' + name + '"]');
        return meta && meta.getAttribute('content') && meta.getAttribute('content').trim().length > 0;
    }

    function hasTitleContent(doc) {
        var title = doc.querySelector('title');
        return title && title.textContent && title.textContent.trim().length > 0;
    }

    var lastResults = null;
    var lastUrl = null;

    window.AuditTool = {
        run: function() {
            var input = document.getElementById('audit-url-input');
            var url = normalizeUrl(input.value);
            if (!url) {
                input.style.borderColor = '#e05c5c';
                setTimeout(function() { input.style.borderColor = ''; }, 2000);
                return;
            }
            lastUrl = url;
            showLoading();
            tryWorker(url);
        },

        submitLead: function() {
            var emailInput = document.getElementById('audit-lead-email');
            var email = emailInput.value.trim();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                emailInput.style.borderColor = '#e05c5c';
                setTimeout(function() { emailInput.style.borderColor = ''; }, 2000);
                return;
            }

            var failedChecks = [];
            if (lastResults) {
                ISSUE_PRIORITY.forEach(function(k) {
                    if (!checkPass(k, lastResults.checks[k])) failedChecks.push(k);
                });
            }

            var payload = {
                type: 'audit_lead',
                email: email,
                url: lastUrl,
                scores: lastResults ? lastResults.scores : {},
                failedChecks: failedChecks,
                timestamp: new Date().toISOString()
            };

            var card = document.getElementById('audit-lead-card');
            card.innerHTML = '<div style="text-align:center;padding:1.5rem;"><p style="color:#5a9e6e;font-size:0.9rem;">You\'re on the list \u2014 we\'ll reach out to <strong>' + escapeHtml(email) + '</strong> within 24 hours with your full fix plan.</p></div>';
            card.style.borderColor = 'rgba(90,158,110,0.5)';
            card.style.background = 'rgba(90,158,110,0.08)';

            fetch(LEAD_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(function() {});
        },

        reset: function() {
            lastResults = null;
            lastUrl = null;
            renderInput();
        }
    };

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getContainer() {
        return document.getElementById('audit-tool-embed');
    }

    function renderInput() {
        var c = getContainer();
        if (!c) return;
        c.innerHTML =
            '<div class="audit-input-screen">' +
                '<div class="audit-input-row">' +
                    '<input type="text" id="audit-url-input" placeholder="yourbusiness.com" onkeydown="if(event.key===\'Enter\')AuditTool.run()">' +
                    '<button id="audit-run-btn" onclick="AuditTool.run()">Run free audit</button>' +
                '</div>' +
                '<p class="audit-hint">No signup required. Results in seconds.</p>' +
            '</div>';
    }

    function showLoading() {
        var c = getContainer();
        c.innerHTML =
            '<div class="audit-loading-screen">' +
                '<div class="audit-progress-bar"><div class="audit-progress-fill" id="audit-progress"></div></div>' +
                '<p class="audit-progress-label" id="audit-progress-label">Fetching your site...</p>' +
            '</div>';
    }

    var progressSteps = [
        [0, 'Fetching your site...'],
        [25, 'Reading page content...'],
        [50, 'Analysing AEO signals...'],
        [75, 'Checking GEO compliance...'],
        [95, 'Building your report...']
    ];

    function animateProgress(onDone) {
        var idx = 0;
        function step() {
            if (idx >= progressSteps.length) { if (onDone) onDone(); return; }
            var bar = document.getElementById('audit-progress');
            var label = document.getElementById('audit-progress-label');
            if (!bar || !label) return;
            bar.style.width = progressSteps[idx][0] + '%';
            label.textContent = progressSteps[idx][1];
            idx++;
            setTimeout(step, 600);
        }
        step();
    }

    function tryWorker(url) {
        animateProgress(null);

        fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                finishLoading(data, false);
            } else {
                fallbackFetch(url);
            }
        })
        .catch(function() {
            fallbackFetch(url);
        });
    }

    function fallbackFetch(url) {
        fetch(PROXY_URL + encodeURIComponent(url))
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data && data.contents) {
                var checks = runClientSideChecks(data.contents, url);
                var scores = calcScores(checks);
                var topIssues = getTopIssues(checks);
                var domain = '';
                try { domain = new URL(url).hostname; } catch(e) {}
                finishLoading({
                    success: true,
                    domain: domain,
                    checks: checks,
                    scores: scores,
                    topIssues: topIssues.map(function(i) { return i.message; }),
                    fetchedAt: new Date().toISOString()
                }, true);
            } else {
                showError('Could not fetch site. Please check the URL and try again.');
            }
        })
        .catch(function() {
            showError('Could not fetch site. Please check the URL and try again.');
        });
    }

    function finishLoading(data, isFallback) {
        var bar = document.getElementById('audit-progress');
        var label = document.getElementById('audit-progress-label');
        if (bar) bar.style.width = '100%';
        if (label) label.textContent = 'Complete!';

        lastResults = data;
        if (!data.scores && data.checks) {
            data.scores = calcScores(data.checks);
        }
        if (!data.topIssues && data.checks) {
            data.topIssues = getTopIssues(data.checks).map(function(i) { return i.message; });
        }

        setTimeout(function() { renderResults(data, isFallback); }, 800);
    }

    function showError(msg) {
        var c = getContainer();
        c.innerHTML =
            '<div class="audit-error">' +
                '<p>' + escapeHtml(msg) + '</p>' +
                '<button onclick="AuditTool.reset()" style="margin-top:1rem;" class="audit-run-btn-style">Try again</button>' +
            '</div>';
    }

    function scoreBadge(label, score) {
        var color = getScoreColor(score);
        var grade = getGradeLabel(score);
        return '<div class="audit-score-badge" style="border-color:' + color + '">' +
                    '<div class="audit-score-label">' + label + '</div>' +
                    '<div class="audit-score-value" style="color:' + color + '">' + score + '</div>' +
                    '<div class="audit-score-grade" style="color:' + color + '">' + grade + '</div>' +
                '</div>';
    }

    function checkDot(key, value) {
        var pass = checkPass(key, value);
        var isNull = value === null;
        var color = isNull ? '#d4893a' : (pass ? '#5a9e6e' : '#e05c5c');
        var statusText = isNull ? 'Unknown' : (pass ? 'Pass' : 'Fail');
        return '<div class="audit-check-row">' +
                    '<span class="audit-check-dot" style="background:' + color + '"></span>' +
                    '<span class="audit-check-label">' + CHECK_LABELS[key] + '</span>' +
                    '<span class="audit-check-status" style="color:' + color + '">' + statusText + '</span>' +
                '</div>';
    }

    function renderResults(data, isFallback) {
        var c = getContainer();
        var scores = data.scores;
        var checks = data.checks;

        var html = '<div class="audit-results">';

        if (isFallback) {
            html += '<p class="audit-fallback-note">Results generated via client-side analysis. Some checks (llms.txt, sitemap) may be limited.</p>';
        }

        // Score badges
        html += '<div class="audit-scores-row">';
        html += scoreBadge('Overall', scores.overall);
        html += scoreBadge('AEO', scores.aeo);
        html += scoreBadge('GEO', scores.geo);
        html += '</div>';

        // Category cards
        html += '<div class="audit-results-grid">';
        Object.keys(CATEGORIES).forEach(function(catKey) {
            var cat = CATEGORIES[catKey];
            var catScore = scores[catKey] || 0;
            var color = getScoreColor(catScore);
            html += '<div class="audit-result-card">';
            html += '<div class="audit-result-card-header">';
            html += '<h4 class="audit-result-card-title">' + cat.label + '</h4>';
            html += '<span class="audit-result-card-score" style="color:' + color + ';border-color:' + color + '">' + catScore + '</span>';
            html += '</div>';
            cat.checks.forEach(function(key) {
                html += checkDot(key, checks[key]);
            });
            html += '</div>';
        });
        html += '</div>';

        // Top issues
        if (data.topIssues && data.topIssues.length > 0) {
            html += '<div class="audit-issues-card">';
            html += '<h4 class="audit-issues-title">Critical Issues Found</h4>';
            html += '<ul class="audit-issues-list">';
            data.topIssues.forEach(function(issue) {
                html += '<li>' + escapeHtml(issue) + '</li>';
            });
            html += '</ul>';
            html += '</div>';
        }

        // Lead capture
        html += '<div class="audit-lead-card" id="audit-lead-card">';
        html += '<h4 class="audit-lead-title">Get Your Full Implementation Plan</h4>';
        html += '<p class="audit-lead-body">We\'ll send a step-by-step fix list for your site and platform, plus a free 15-min strategy call.</p>';
        html += '<div class="audit-lead-row">';
        html += '<input type="email" id="audit-lead-email" placeholder="your@email.com" onkeydown="if(event.key===\'Enter\')AuditTool.submitLead()">';
        html += '<button onclick="AuditTool.submitLead()" class="audit-lead-btn">Send my plan</button>';
        html += '</div>';
        html += '</div>';

        // Reset link
        html += '<p class="audit-reset-link"><a href="javascript:void(0)" onclick="AuditTool.reset()">Audit another site</a></p>';

        html += '</div>';
        c.innerHTML = html;
    }

    // Init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderInput);
    } else {
        renderInput();
    }
})();
