function Homepage({ onGetStarted, onSignIn }) {
  return (
    <div className="cs-home">
      <section id="overview" className="cs-home-section cs-home-hero">
        <h1 className="cs-home-h1">Operational readiness, in under a minute.</h1>
        <p className="cs-home-p">
          Designed exclusively for first responders, Cleras helps you better understand how
          sleep, stress, critical incidents, and recovery may be affecting your readiness.
          Four quick questions provide a simple, private readiness signal; so you can
          recognize small changes before they become bigger challenges.
        </p>
        <div className="cs-home-cta">
          <button className="cs-cta-primary cs-full-width" onClick={onGetStarted}>
            GET STARTED
          </button>
          <button className="cs-cta-secondary cs-full-width" onClick={onSignIn}>
            SIGN IN
          </button>
        </div>
      </section>

      <section id="why-it-matters" className="cs-home-section">
        <div className="cs-eyebrow">WHY IT MATTERS</div>
        <h2 className="cs-home-h2">The job rarely gives you time to notice what it's taking from you.</h2>
        <p className="cs-home-p">
          Poor sleep, chronic stress, and repeated exposure to critical incidents don't
          usually hit all at once, they build gradually over time. By the time you notice
          the change, it may already be affecting your health, your performance, or life at
          home. Cleras Shield gives you a quick, private check-in to help you recognize
          those changes early and helps navigate you to next care steps.
        </p>
      </section>

      <section id="how-it-works" className="cs-home-section">
        <div className="cs-eyebrow">HOW IT WORKS</div>
        <h2 className="cs-home-h2">Four questions. One readiness signal.</h2>
        <p className="cs-home-p">
          Your daily check-in takes about a minute. You'll answer four simple questions
          about your sleep, current stress, exposure to critical incidents, and how
          recovered you feel heading into your shift. Together, those responses generate
          your personalized Readiness Index and a Green, Amber, or Red Readiness Status, a
          familiar color system that provides an easy-to-understand snapshot of how you're
          doing today. Over time, your daily check-ins build a history of your readiness,
          helping you recognize trends and catch small changes before they become bigger
          challenges.
        </p>
        <div className="cs-condition-dist" style={{ marginTop: 20 }}>
          <div className="cs-dist-chip" style={{ color: "var(--sig-green)" }}>
            GREEN
          </div>
          <div className="cs-dist-chip" style={{ color: "var(--sig-amber)" }}>
            AMBER
          </div>
          <div className="cs-dist-chip" style={{ color: "var(--sig-red)" }}>
            RED
          </div>
        </div>
      </section>

      <section id="privacy-security" className="cs-home-section">
        <div className="cs-eyebrow">PRIVACY & SECURITY</div>
        <h2 className="cs-home-h2">Your check-ins are yours and yours alone.</h2>
        <p className="cs-home-p">
          Your responses are protected using industry-standard security practices so only
          you can access your personal check-in history. Your individual answers are never
          shared with command staff, supervisors, or your agency. This information exists
          to help you better understand your own well-being.
        </p>
      </section>

      <section id="who-its-for" className="cs-home-section">
        <div className="cs-eyebrow">WHO IT'S FOR</div>
        <h2 className="cs-home-h2">Built for the people who run toward it.</h2>
        <p className="cs-home-p">
          Cleras Shield was built specifically for public safety dispatchers, police
          officers, custody officers, and sheriff's deputies to provide a simple, private
          way to check in before every shift. In about a minute, you'll receive a
          personalized Readiness Index based on how you're sleeping, recovering, managing
          stress, and responding to the demands of the job.
        </p>
      </section>

      <section className="cs-home-section cs-home-closing">
        <h2 className="cs-home-h2">One minute could help you notice what the job has been quietly changing.</h2>
        <div className="cs-home-cta">
          <button className="cs-cta-primary cs-full-width" onClick={onGetStarted}>
            GET STARTED
          </button>
          <button className="cs-cta-secondary cs-full-width" onClick={onSignIn}>
            SIGN IN
          </button>
        </div>
      </section>
    </div>
  );
}
export default Homepage 
