'use client'

import { useEffect } from 'react'

// Marketing landing page for unauthenticated visitors at /.
// All styling lives in globals.css under the .fp-landing selector.
export default function Landing() {
  useEffect(() => {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible')
          revealObserver.unobserve(e.target)
        }
      })
    }, { threshold: 0.12 })

    document.querySelectorAll('.fp-landing .reveal').forEach(el => revealObserver.observe(el))

    const ctaFinal = document.querySelector('.fp-landing .cta-final')
    const stickyCta = document.querySelector('.fp-landing .sticky-cta') as HTMLElement | null
    let stickyObserver: IntersectionObserver | null = null

    if (ctaFinal && stickyCta) {
      stickyObserver = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (stickyCta) {
            stickyCta.style.opacity = e.isIntersecting ? '0' : '1'
            stickyCta.style.pointerEvents = e.isIntersecting ? 'none' : 'auto'
          }
        })
      }, { threshold: 0.3 })
      stickyObserver.observe(ctaFinal)
    }

    return () => {
      revealObserver.disconnect()
      stickyObserver?.disconnect()
    }
  }, [])

  return (
    <div className="fp-landing">

      {/* TICKER */}
      <div className="ticker-bar">
        <div className="ticker-label">Live</div>
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div className="ticker-track">
            <span className="ticker-item"><span className="t-name">S. Scheffler</span><span className="t-g">-9</span><span className="t-thru">F</span></span>
            <span className="ticker-item"><span className="t-name">R. McIlroy</span><span className="t-g">-7</span><span className="t-thru">F</span></span>
            <span className="ticker-item"><span className="t-name">X. Schauffele</span><span className="t-g">-5</span><span className="t-thru">16</span></span>
            <span className="ticker-item"><span className="t-name">C. Morikawa</span><span className="t-g">-4</span><span className="t-thru">F</span></span>
            <span className="ticker-item"><span className="t-name">T. Fleetwood</span><span className="t-g">-3</span><span className="t-thru">14</span></span>
            <span className="ticker-item"><span className="t-name">B. DeChambeau</span><span className="t-e">E</span><span className="t-thru">F</span></span>
            <span className="ticker-item"><span className="t-name">J. Thomas</span><span className="t-r">+2</span><span className="t-thru">F</span></span>
            <span className="ticker-item"><span className="t-name">P. Cantlay</span><span className="t-r">+4</span><span className="t-thru">12</span></span>
            <span className="ticker-item"><span className="t-name">S. Scheffler</span><span className="t-g">-9</span><span className="t-thru">F</span></span>
            <span className="ticker-item"><span className="t-name">R. McIlroy</span><span className="t-g">-7</span><span className="t-thru">F</span></span>
            <span className="ticker-item"><span className="t-name">X. Schauffele</span><span className="t-g">-5</span><span className="t-thru">16</span></span>
            <span className="ticker-item"><span className="t-name">C. Morikawa</span><span className="t-g">-4</span><span className="t-thru">F</span></span>
            <span className="ticker-item"><span className="t-name">T. Fleetwood</span><span className="t-g">-3</span><span className="t-thru">14</span></span>
            <span className="ticker-item"><span className="t-name">B. DeChambeau</span><span className="t-e">E</span><span className="t-thru">F</span></span>
            <span className="ticker-item"><span className="t-name">J. Thomas</span><span className="t-r">+2</span><span className="t-thru">F</span></span>
            <span className="ticker-item"><span className="t-name">P. Cantlay</span><span className="t-r">+4</span><span className="t-thru">12</span></span>
          </div>
        </div>
      </div>

      {/* NAV */}
      <nav>
        <div className="fp-logo">Fore<span>Picks</span></div>
        <div className="fp-nav-links">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="/auth" className="fp-nav-cta">⛳ Create a League</a>
        </div>
        <a href="/auth" className="fp-nav-mobile-cta">⛳ Create a League</a>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-eyebrow">⛳ Live Tour Scoring · No Download</div>
        <h1>
          Run your<br />golf league,<br />
          <span className="italic-line">your way.</span>
        </h1>
        <p className="hero-sub">
          Pick 4 golfers each tournament. Lowest combined score wins. Snake draft, live scoring,
          custom stakes — all the fun, none of the spreadsheets.
        </p>
        <div className="hero-actions">
          <a href="/auth" className="btn-primary">Create a League</a>
          <a href="/join" className="btn-ghost">Join a League →</a>
        </div>
        <div className="hero-stats">
          <div className="stat"><span className="stat-n">4</span><span className="stat-l">Picks per player</span></div>
          <div className="stat"><span className="stat-n">2min</span><span className="stat-l">Score updates</span></div>
          <div className="stat"><span className="stat-n">50+</span><span className="stat-l">Tour events/season</span></div>
          <div className="stat"><span className="stat-n">6</span><span className="stat-l">Players max</span></div>
        </div>
        <div className="hero-card">
          <div className="hc-top">
            <span className="hc-event">The Masters · R3</span>
            <span className="hc-live">Live</span>
          </div>
          <div className="hc-row">
            <div className="hc-golfer"><div className="hc-avi">🏌️</div><span className="hc-name">Scheffler</span></div>
            <span className="hc-score g">-9</span>
          </div>
          <div className="hc-row">
            <div className="hc-golfer"><div className="hc-avi">🏌️</div><span className="hc-name">McIlroy</span></div>
            <span className="hc-score g">-6</span>
          </div>
          <div className="hc-row">
            <div className="hc-golfer"><div className="hc-avi">🏌️</div><span className="hc-name">Schauffele</span></div>
            <span className="hc-score e">E</span>
          </div>
          <div className="hc-row">
            <div className="hc-golfer"><div className="hc-avi">🏌️</div><span className="hc-name">Morikawa</span></div>
            <span className="hc-score r">+2</span>
          </div>
          <div className="hc-total">
            <span className="hc-total-label">Your Total</span>
            <span className="hc-total-score">-13</span>
          </div>
          <div className="hc-rank">🏆 <strong>1st place</strong> in your league</div>
        </div>
      </section>

      {/* GAMEPLAY — How to play */}
      <section className="gameplay" id="how">
        <div className="section-wrap">
          <div className="reveal">
            <div className="section-eyebrow">How to play</div>
            <h2 className="section-h">Golf fantasy,<br />finally simple.</h2>
            <p className="section-body">No salary caps. No waiver wires. Pick 4 golfers before each tournament and root for low scores.</p>
          </div>
          <div className="gameplay-grid">
            <div className="pick-flow reveal d2">
              <div className="pick-round">
                <div className="pick-round-header">
                  <span>Your Draft Picks · The Masters</span>
                  <span className="badge">Your Turn</span>
                </div>
                <div className="pick-slot">
                  <div className="pick-num">1</div>
                  <span className="pick-name">Scottie Scheffler</span>
                  <span className="pick-odds">+350</span>
                  <span className="pick-score g">-9</span>
                </div>
                <div className="pick-slot">
                  <div className="pick-num">2</div>
                  <span className="pick-name">Rory McIlroy</span>
                  <span className="pick-odds">+600</span>
                  <span className="pick-score g">-6</span>
                </div>
                <div className="pick-slot">
                  <div className="pick-num">3</div>
                  <span className="pick-name">Xander Schauffele</span>
                  <span className="pick-odds">+900</span>
                  <span className="pick-score e">E</span>
                </div>
                <div className="pick-slot empty">
                  <div className="pick-num">4</div>
                  <span className="pick-name">Choose your 4th golfer…</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px' }}>
                <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.07)' }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Scores update all weekend</span>
                <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.07)' }} />
              </div>
              <div className="pick-round">
                <div className="pick-round-header">
                  <span>Final Standings</span>
                  <span style={{ color: 'var(--lp-green)', fontSize: 10, fontWeight: 700 }}>Tournament complete</span>
                </div>
                <div className="pick-slot">
                  <div className="pick-num" style={{ background: 'rgba(255,201,64,0.1)', borderColor: 'rgba(255,201,64,0.3)', color: '#ffc940' }}>🏆</div>
                  <span className="pick-name">You — Mike T.</span>
                  <span className="pick-odds" style={{ color: 'var(--lp-green)' }}>-13 total</span>
                  <span className="pick-score g" style={{ fontSize: 20 }}>$50</span>
                </div>
                <div className="pick-slot">
                  <div className="pick-num" style={{ color: 'rgba(255,255,255,0.5)' }}>2</div>
                  <span className="pick-name" style={{ color: 'rgba(255,255,255,0.6)' }}>Sarah K.</span>
                  <span className="pick-odds">-8 total</span>
                </div>
                <div className="pick-slot">
                  <div className="pick-num" style={{ color: 'rgba(255,255,255,0.5)' }}>3</div>
                  <span className="pick-name" style={{ color: 'rgba(255,255,255,0.6)' }}>Dave R.</span>
                  <span className="pick-odds">-5 total</span>
                </div>
              </div>
            </div>

            <div className="rule-list reveal d3">
              <div className="rule-item">
                <div className="rule-icon">📋</div>
                <div>
                  <h4>Snake draft before each tournament</h4>
                  <p>Everyone picks in order — then the order reverses. Pick 4 golfers total. Draft order rotates each week so no one has a permanent edge.</p>
                </div>
              </div>
              <div className="rule-item">
                <div className="rule-icon">➕</div>
                <div>
                  <h4>Your score = combined total of your 4 picks</h4>
                  <p>Add up all 4 golfers&apos; final scores. Lowest combined total wins. Simple as a golf scorecard.</p>
                </div>
              </div>
              <div className="rule-item">
                <div className="rule-icon">💰</div>
                <div>
                  <h4>Set your own stakes</h4>
                  <p>$5 a week with the office or $100 for the majors — you decide. Season standings track who&apos;s up across the year.</p>
                </div>
              </div>
              <div className="rule-item">
                <div className="rule-icon">📡</div>
                <div>
                  <h4>Scores update automatically</h4>
                  <p>Live tour data feeds in every 2 minutes. No manual score entry, no spreadsheets, no arguments.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — 3 steps */}
      <section className="steps-wrap">
        <div className="section-wrap">
          <div className="reveal">
            <div className="section-eyebrow">Get started</div>
            <h2 className="section-h">Three steps.<br />Tee it up.</h2>
          </div>
          <div className="steps-grid">
            <div className="step-card reveal d1">
              <div className="step-ghost">01</div>
              <div className="step-icon-wrap">🏆</div>
              <div className="step-lbl">Step 01</div>
              <h3>Create Your League</h3>
              <p>Name it, set your stakes, choose roster size. Sensible defaults mean you can skip every setting and still be up and running.</p>
            </div>
            <div className="step-card reveal d2">
              <div className="step-ghost">02</div>
              <div className="step-icon-wrap">📲</div>
              <div className="step-lbl">Step 02</div>
              <h3>Invite Your Crew</h3>
              <p>Share a 6-character code or a direct link. No account needed to join — anyone with the link is in instantly.</p>
            </div>
            <div className="step-card reveal d3">
              <div className="step-ghost">03</div>
              <div className="step-icon-wrap">⛳</div>
              <div className="step-lbl">Step 03</div>
              <h3>Draft &amp; Compete</h3>
              <p>Live snake draft before each PGA event. Scores roll in automatically all weekend. Trash-talk in the league feed.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features-wrap" id="features">
        <div className="section-wrap">
          <div className="reveal">
            <div className="section-eyebrow">Everything included</div>
            <h2 className="section-h">Your league,<br />your rules.</h2>
          </div>
          <div className="features-grid">
            <div className="feat-list reveal d1">
              <div className="feat-item">
                <div className="feat-icon">💰</div>
                <div><h4>Custom Payouts</h4><p>Set stakes per tournament: $5, $10, $100. Season standings track money in and out automatically.</p></div>
              </div>
              <div className="feat-item">
                <div className="feat-icon">🔄</div>
                <div><h4>Live Snake Draft</h4><p>Real-time draft room before every tour event. Rotating order, no waiting around.</p></div>
              </div>
              <div className="feat-item">
                <div className="feat-icon">📡</div>
                <div><h4>Automatic Scoring</h4><p>Live tour data, updated every 2 minutes. No manual entry, ever.</p></div>
              </div>
              <div className="feat-item">
                <div className="feat-icon">📊</div>
                <div><h4>Season Tracking</h4><p>Money standings, tournament history, and head-to-head records across the full season.</p></div>
              </div>
              <div className="feat-item">
                <div className="feat-icon">🏅</div>
                <div><h4>Majors Auto-Flagged</h4><p>Masters, US Open, The Open, PGA Championship — automatically highlighted with higher-stakes options.</p></div>
              </div>
            </div>

            <div className="lb-mock reveal d2">
              <div className="lb-top">
                <span className="lb-title">The Masters 2025</span>
                <span className="lb-meta">R3 · Live</span>
              </div>
              <div className="lb-row"><span className="lb-pos gold">1</span><span className="lb-name">Mike T.</span><span className="lb-thru">F</span><span className="lb-sc g">-13</span></div>
              <div className="lb-row"><span className="lb-pos">2</span><span className="lb-name">Sarah K.</span><span className="lb-thru">F</span><span className="lb-sc g">-8</span></div>
              <div className="lb-row"><span className="lb-pos">3</span><span className="lb-name">Dave R.</span><span className="lb-thru">14</span><span className="lb-sc g">-5</span></div>
              <div className="lb-divider" />
              <div className="lb-row"><span className="lb-pos">4</span><span className="lb-name">Jen M.</span><span className="lb-thru">F</span><span className="lb-sc e">E</span></div>
              <div className="lb-row"><span className="lb-pos">5</span><span className="lb-name">Chris B.</span><span className="lb-thru">F</span><span className="lb-sc r">+5</span></div>
              <div className="lb-picks-box">
                <div className="lb-picks-lbl">Mike&apos;s Picks — Round Leader</div>
                <div className="lb-picks-grid">
                  <div className="lb-pick"><span className="lb-pick-name">Scheffler</span><span className="lb-pick-sc" style={{ color: 'var(--lp-green)' }}>-9</span></div>
                  <div className="lb-pick"><span className="lb-pick-name">McIlroy</span><span className="lb-pick-sc" style={{ color: 'var(--lp-green)' }}>-6</span></div>
                  <div className="lb-pick"><span className="lb-pick-name">Schauffele</span><span className="lb-pick-sc" style={{ color: 'rgba(255,255,255,0.5)' }}>E</span></div>
                  <div className="lb-pick"><span className="lb-pick-name">Morikawa</span><span className="lb-pick-sc" style={{ color: 'var(--lp-green)' }}>-4</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="social-wrap">
        <div className="section-wrap">
          <div className="reveal">
            <div className="section-eyebrow">Leagues running now</div>
            <h2 className="section-h">Your friends<br />are already playing.</h2>
            <p className="section-body">From 3-person friend groups to 12-person office pools. Every size, every budget.</p>
          </div>
          <div className="leagues-grid">
            <div className="league-card reveal d1">
              <div className="lc-top">
                <div><div className="lc-name">The Sunday Boys ⛳</div><div className="lc-week">Week 14 · Masters</div></div>
                <span className="lc-badge">Active</span>
              </div>
              <div className="lc-leader">Leading: <strong>Jake M. at -11</strong></div>
              <div className="lc-bar"><div className="lc-bar-fill" style={{ width: '78%' }} /></div>
              <div className="lc-players">6 players · $10/week</div>
            </div>
            <div className="league-card reveal d2">
              <div className="lc-top">
                <div><div className="lc-name">Office Scramble 🏢</div><div className="lc-week">Week 14 · Masters</div></div>
                <span className="lc-badge">Active</span>
              </div>
              <div className="lc-leader">Leading: <strong>Priya S. at -8</strong></div>
              <div className="lc-bar"><div className="lc-bar-fill" style={{ width: '55%' }} /></div>
              <div className="lc-players">9 players · $25/week</div>
            </div>
            <div className="league-card reveal d3">
              <div className="lc-top">
                <div><div className="lc-name">Dad&apos;s Golf Group 🍺</div><div className="lc-week">Week 14 · Masters</div></div>
                <span className="lc-badge">Active</span>
              </div>
              <div className="lc-leader">Leading: <strong>Tom B. at -6</strong></div>
              <div className="lc-bar"><div className="lc-bar-fill" style={{ width: '40%' }} /></div>
              <div className="lc-players">4 players · $5/week</div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="cta-final">
        <div className="section-wrap">
          <div className="cta-inner reveal">
            <h2>Ready to run a<br /><em>real league?</em></h2>
            <p>Set up your league, invite your group with a link, and draft before the next tour event. Works on any device — no app needed.</p>
            <div className="cta-actions">
              <a href="/auth" className="btn-primary" style={{ fontSize: 16, padding: '17px 40px' }}>⛳ &nbsp;Create Your League</a>
              <a href="/join" className="btn-ghost" style={{ fontSize: 16 }}>Join a League →</a>
            </div>
            <p className="cta-note">No account required to join · Works on iPhone, Android &amp; desktop</p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-logo">Fore<span>Picks</span></div>
        <p>Live tour scoring data · Updated every 2 minutes</p>
        <p>© 2025 Fore Picks</p>
      </footer>

      {/* STICKY MOBILE CTA */}
      <div className="sticky-cta">
        <a href="/auth" className="btn-primary">⛳ Create a League</a>
        <a href="/join" className="btn-ghost">Join</a>
      </div>

    </div>
  )
}
