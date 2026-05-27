const fs = require('fs');
let code = fs.readFileSync('src/components/wedding/PublicHero.tsx', 'utf-8');

const modernLayout = `  if (config.layout === "modern") {
    return (
      <section className="min-h-screen flex flex-col bg-background pt-12 pb-8 px-6 sm:px-12 max-w-7xl mx-auto">
        <div className="flex justify-between items-end mb-8 sm:mb-12">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className={\`\${currentStyle.titleClass} text-4xl sm:text-6xl md:text-7xl font-bold leading-none w-2/3\`}
          >
            {config.coupleName ? (
              <>
                {config.coupleName.split('&')[0].trim()} <br />
                <span className="text-primary">+</span> {config.coupleName.split('&')[1]?.trim() || ''}
              </>
            ) : (
              <>Camila <br/><span className="text-primary">+</span> Rafael</>
            )}
          </motion.h1>
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-right pb-2">
            <p className="text-xs sm:text-sm tracking-[0.2em] uppercase text-muted-foreground font-semibold mb-2">
              {formattedDate}
            </p>
          </motion.div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="flex-1 w-full min-h-[40vh] bg-neutral-200 rounded-3xl relative overflow-hidden mb-8 shadow-xl border border-border/50">
          {hasHeroImage ? (
            <img
              src={config.heroImage || heroCoupleImage}
              alt={config.coupleName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-secondary via-muted to-accent flex items-center justify-center">
              <Heart className="w-20 h-20 text-gold/20" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/5" />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl mx-auto">
          {config.sections.weddingInfo && (
            <button
              onClick={() => document.getElementById('wedding-info')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex-1 bg-primary text-primary-foreground py-4 px-6 rounded-xl text-sm sm:text-base uppercase tracking-widest font-bold flex items-center justify-center shadow-soft hover:bg-primary/90 transition-colors">
              Confirmar Presença
            </button>
          )}
          {config.sections.giftRegistry && (
            <button
              onClick={() => document.getElementById('gifts')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex-1 bg-background border-2 border-border text-foreground py-4 px-6 rounded-xl text-sm sm:text-base uppercase tracking-widest font-bold flex items-center justify-center hover:bg-muted transition-colors">
              Lista de Presentes
            </button>
          )}
        </motion.div>
      </section>
    );
  }

`;

const minimalistLayout = `  if (config.layout === "minimalist") {
    return (
      <section className="min-h-screen flex flex-col md:flex-row bg-background">
        <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 md:px-24 py-20 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-6">
            <p className="text-xs sm:text-sm tracking-[0.3em] uppercase text-muted-foreground">
              {config.weddingDate ? (() => {
                const [year, month, day] = config.weddingDate.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
              })() : 'AUGUST 15, 2025'}
            </p>
            
            <h1 className={\`\${currentStyle.titleClass} text-5xl sm:text-7xl lg:text-8xl leading-[1.1] tracking-tight\`}>
              {config.coupleName ? (
                <>
                  {config.coupleName.split('&')[0].trim()}
                  <span className="font-sans text-3xl sm:text-5xl text-muted-foreground/50 mx-4 font-thin align-middle">|</span>
                  {config.coupleName.split('&')[1]?.trim() || ''}
                </>
              ) : (
                <>Camila <span className="font-sans text-3xl sm:text-5xl text-muted-foreground/50 mx-4 font-thin align-middle">|</span> Rafael</>
              )}
            </h1>

            {config.tagline && (
              <p className="text-foreground/70 text-lg sm:text-xl font-light max-w-md leading-relaxed mt-8">
                {config.tagline}
              </p>
            )}

            <div className="pt-12 mt-12 w-full max-w-md border-t border-border flex justify-between items-center">
              <span className="text-xs tracking-widest text-muted-foreground">
                #{config.coupleName ? config.coupleName.split('&').map(n => n.trim().split(' ')[0]).join('').toUpperCase() : 'CAMILARAFA'}
              </span>
              <button 
                onClick={scrollToInfo}
                className="text-xs uppercase tracking-[0.2em] font-medium border-b border-foreground pb-1 hover:text-primary hover:border-primary transition-colors">
                Ver Detalhes
              </button>
            </div>
          </motion.div>
        </div>

        {/* Minimalist Image Aside */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="w-full md:w-[45%] h-[50vh] md:h-screen relative hidden sm:block">
          {hasHeroImage ? (
            <img
              src={config.heroImage || heroCoupleImage}
              alt={config.coupleName}
              className="w-full h-full object-cover grayscale-[30%]"
            />
          ) : (
            <div className="w-full h-full bg-secondary/50 flex items-center justify-center">
              <Heart className="w-16 h-16 text-muted-foreground/20" />
            </div>
          )}
        </motion.div>
      </section>
    );
  }

`;

const targetString = '  return (\n    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">';
code = code.replace(targetString, modernLayout + minimalistLayout + targetString);
fs.writeFileSync('src/components/wedding/PublicHero.tsx', code);
console.log('Successfully injected mockups into PublicHero');
