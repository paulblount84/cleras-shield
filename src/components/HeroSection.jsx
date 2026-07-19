function HeroSection ({ onGetStarted, onSignIn }) {
  return (
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
        </div>} 
        export default HeroSection;
