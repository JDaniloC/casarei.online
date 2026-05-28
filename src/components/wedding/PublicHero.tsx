import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { ChevronDown, Heart } from "lucide-react";
import { useWedding } from "@/contexts/WeddingContext";
import { useLocation } from "react-router-dom";
import heroCoupleImage from "@/assets/hero-couple.jpg";

interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const PublicHero = () => {
  const { config } = useWedding();
  const weddingDate = new Date(config.weddingDate + "T16:00:00");
  const [countdown, setCountdown] = useState<CountdownTime>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      const difference = weddingDate.getTime() - now.getTime();

      if (difference > 0) {
        setCountdown({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      }
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, [config.weddingDate]);

  const location = useLocation();
  const isPreview = location.pathname.startsWith("/preview");
  const isGuestView =
    isPreview ||
    location.pathname.endsWith("/convite") ||
    new URLSearchParams(location.search).has("convite");

  const scrollToInfo = () => {
    const hasWeddingInfo = isGuestView && config.sections.weddingInfo;
    const targetId = hasWeddingInfo ? "wedding-info" : "gifts";
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
  };

  // Fix timezone issue by parsing the date correctly
  const formattedDate = config.weddingDate
    ? (() => {
        const [year, month, day] = config.weddingDate.split("-").map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString("pt-BR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      })()
    : "";

  const hasHeroImage = config.heroImage || heroCoupleImage;

  // Layout-specific styles
  const layoutStyles: Record<string, { overlay: string; titleClass: string }> =
    {
      classic: {
        overlay: "bg-gradient-to-b from-black/50 via-black/40 to-black/70",
        titleClass: "font-serif drop-shadow-md",
      },
      modern: {
        overlay:
          "bg-gradient-to-b from-slate-900/60 via-slate-900/50 to-slate-900/80",
        titleClass: "font-sans tracking-tight drop-shadow-lg",
      },
      minimalist: {
        overlay:
          "bg-gradient-to-b from-stone-900/40 via-stone-900/20 to-stone-900/60",
        titleClass: "font-serif font-light drop-shadow-sm",
      },
      editorial: {
        overlay: "hidden",
        titleClass: "font-serif text-primary",
      },
    };

  const currentStyle = layoutStyles[config.layout] || layoutStyles.classic;

  if (config.layout === "modern") {
    return (
      <section className="min-h-screen flex flex-col md:flex-row bg-[#F1F3F5] text-[#1E293B] relative overflow-hidden font-sans">
        {/* Left Side: Text and Countdown */}
        <div className="flex-1 flex flex-col justify-between p-8 sm:p-16 md:p-24 z-10 max-w-2xl">
          <div className="flex justify-between items-center w-full border-b border-border/80 pb-4 mb-8">
            <span className="text-xs font-bold tracking-widest uppercase text-primary">Vamos nos casar</span>
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {config.weddingDate ? config.weddingDate.split('-').reverse().join('.') : ""}
            </span>
          </div>

          <div className="my-auto space-y-6">
            <h1 className="text-5xl sm:text-7xl font-sans font-bold tracking-tighter text-left leading-none text-[#1E293B]">
              {config.coupleName ? (
                <>
                  {config.coupleName.split('&')[0].trim()} <br />
                  <span className="text-primary font-light">+</span> {config.coupleName.split('&')[1]?.trim() || ''}
                </>
              ) : (
                <>Camila <br/><span className="text-primary">+</span> Rafael</>
              )}
            </h1>

            {config.tagline && (
              <p className="text-muted-foreground text-lg sm:text-xl font-light leading-relaxed max-w-md italic border-l-2 border-primary pl-4">
                "{config.tagline}"
              </p>
            )}

            {config.themeDecorations !== false && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="w-12 h-12 text-primary opacity-80"
              >
                <svg className="w-full h-full" viewBox="0 0 100 100" fill="currentColor">
                  <path d="M50 15 C45 35, 25 35, 10 40 C30 45, 45 40, 50 15 Z" />
                  <path d="M50 15 C55 35, 75 35, 90 40 C70 45, 55 40, 50 15 Z" />
                  <path d="M50 15 C50 45, 50 70, 50 85" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </motion.div>
            )}

            {/* Countdown in Modern Cards */}
            <div className="grid grid-cols-4 gap-3 w-full max-w-sm pt-4">
              {[
                { value: countdown.days, label: "Dias" },
                { value: countdown.hours, label: "Horas" },
                { value: countdown.minutes, label: "Min" },
                { value: countdown.seconds, label: "Seg" }
              ].map((item) => (
                <div key={item.label} className="bg-white rounded-lg p-3 border border-border flex flex-col items-center justify-center shadow-sm">
                  <span className="text-2xl sm:text-3xl font-bold text-primary leading-none">{String(item.value).padStart(2, "0")}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5 font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex gap-4 w-full max-w-md">
            <button
              onClick={scrollToInfo}
              className="flex-1 bg-[#1A2F4C] text-white py-3.5 rounded-lg text-xs uppercase tracking-widest font-bold flex items-center justify-center shadow hover:bg-neutral-800 transition-all duration-300"
            >
              {isGuestView && config.sections.weddingInfo ? "Ver Informações" : "Lista de Presentes"}
            </button>
          </div>
        </div>

        {/* Right Side: Large Asymmetrical Image */}
        <div className="flex-1 min-h-[40vh] md:min-h-screen relative overflow-hidden">
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
          <div className="absolute inset-0 bg-gradient-to-t from-[#F1F3F5] via-transparent to-transparent md:bg-gradient-to-r md:from-[#F1F3F5] md:via-transparent" />
        </div>
      </section>
    );
  }

  if (config.layout === "minimalist") {
    return (
      <section className="min-h-screen flex flex-col justify-between p-8 sm:p-12 md:p-16 bg-[#FAF9F6] text-neutral-800 relative overflow-hidden font-light tracking-wide">
        {/* Top Header */}
        <div className="flex justify-between items-center w-full text-xs text-neutral-400 font-sans tracking-[0.3em] uppercase">
          <span>{config.coupleName ? config.coupleName.split("&")[0].trim()[0] + " | " + (config.coupleName.split("&")[1] || "").trim()[0] : "C | R"}</span>
          <div className="flex gap-4">
            <span onClick={scrollToInfo} className="cursor-pointer hover:text-neutral-900 transition-colors">RSVP</span>
          </div>
        </div>

        {/* Central Content with Framed Image */}
        <div className="my-auto flex flex-col items-center text-center space-y-8 py-8">
          <div className="space-y-4">
            <p className="text-[10px] sm:text-xs tracking-[0.4em] uppercase text-neutral-400 font-medium">
              {config.weddingDate ? (() => {
                const [year, month, day] = config.weddingDate.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
              })() : "AUGUST 15, 2025"}
            </p>
            {config.themeDecorations !== false && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="flex justify-center w-full mb-4 text-neutral-600 opacity-60"
              >
                <svg className="w-10 h-10" viewBox="0 0 100 100" fill="currentColor">
                  <path d="M50 15 C45 35, 25 35, 10 40 C30 45, 45 40, 50 15 Z" />
                  <path d="M50 15 C55 35, 75 35, 90 40 C70 45, 55 40, 50 15 Z" />
                  <path d="M50 15 C50 45, 50 70, 50 85" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </motion.div>
            )}
            <h1 className="font-serif text-4xl sm:text-6xl text-neutral-950 font-light leading-tight tracking-tight max-w-3xl">
              {config.coupleName ? (
                <>
                  {config.coupleName.split('&')[0].trim()}
                  <span className="font-sans text-xl text-neutral-300 mx-2 font-thin">|</span>
                  {config.coupleName.split('&')[1]?.trim() || ''}
                </>
              ) : (
                <>Camila <span className="font-sans text-xl text-neutral-300 mx-2 font-thin">|</span> Rafael</>
              )}
            </h1>
          </div>

          {/* Elegant Framed Image */}
          <div className="w-full max-w-sm aspect-[4/3] bg-white border border-neutral-200 p-1.5 shadow-sm rounded-none">
            {hasHeroImage ? (
              <img
                src={config.heroImage || heroCoupleImage}
                alt={config.coupleName}
                className="w-full h-full object-cover grayscale opacity-95 contrast-110"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-stone-100">
                <Heart className="w-12 h-12 text-neutral-300" />
              </div>
            )}
          </div>

          {config.tagline && (
            <p className="text-neutral-500 text-base font-light italic leading-relaxed max-w-md font-serif">
              "{config.tagline}"
            </p>
          )}

          {/* Simple Countdown in row without cards */}
          <div className="flex justify-center gap-6 sm:gap-12 mt-4">
            {[
              { value: countdown.days, label: "dias" },
              { value: countdown.hours, label: "horas" },
              { value: countdown.minutes, label: "minutos" },
              { value: countdown.seconds, label: "segundos" },
            ].map((item) => (
              <div key={item.label} className="text-center font-sans">
                <span className="block text-2xl sm:text-3xl font-light text-neutral-900 leading-none">
                  {String(item.value).padStart(2, "0")}
                </span>
                <span className="text-neutral-400 text-[9px] uppercase tracking-widest mt-1 block">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="border-t border-neutral-200/50 pt-4 flex justify-between items-center w-full text-[10px] text-neutral-400">
          <span className="tracking-widest uppercase">#{config.coupleName ? config.coupleName.replace(/\s*&\s*/g, "").toUpperCase() : "CAMILARAFAEL"}</span>
          <span 
            onClick={scrollToInfo}
            className="cursor-pointer font-sans uppercase tracking-[0.25em] text-neutral-900 border-b border-neutral-900 pb-0.5 font-medium hover:text-neutral-600 hover:border-neutral-600 transition-colors"
          >
            VER DETALHES
          </span>
        </div>
      </section>
    );
  }

  if (config.layout === "magazine") {
    return (
      <section className="min-h-screen flex flex-col md:flex-row bg-[#FAF9F6] text-neutral-900 relative overflow-hidden font-serif">
        {/* Left Side: Large Full-Height Image */}
        <div className="flex-[4] min-h-[50vh] md:min-h-screen relative overflow-hidden border-b md:border-b-0 md:border-r border-neutral-200">
          {hasHeroImage ? (
            <img
              src={config.heroImage || heroCoupleImage}
              alt={config.coupleName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-[#EAE8E4] flex items-center justify-center">
              <Heart className="w-20 h-20 text-[#A29F9A]" />
            </div>
          )}
          <div className="absolute top-6 left-6 text-xs text-white font-sans font-bold tracking-widest uppercase bg-black/40 backdrop-blur-sm px-3 py-1 rounded">
            {config.coupleName ? config.coupleName.split('&')[0].trim()[0] + ' & ' + (config.coupleName.split('&')[1] || '').trim()[0] : 'C & R'}
          </div>
        </div>

        {/* Right Side: Clean sophisticated offset text */}
        <div className="flex-[5] flex flex-col justify-between p-8 sm:p-16 md:p-24 bg-[#FAF9F6] z-10">
          <div className="flex justify-between items-center w-full text-xs text-[#8E8B82] font-sans tracking-[0.3em] uppercase border-b border-neutral-200 pb-4">
            <span>Revista Nupcial</span>
            <span>Edição Especial</span>
          </div>

          <div className="my-auto space-y-8 text-left py-12">
            <div className="space-y-2">
              <p className="text-[10px] tracking-[0.35em] uppercase text-primary font-bold">Salvem esta data</p>
              
              {config.themeDecorations !== false && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="w-12 h-12 text-primary opacity-80 mb-4"
                >
                  <svg className="w-full h-full" viewBox="0 0 100 100" fill="currentColor">
                    <path d="M50 15 C45 35, 25 35, 10 40 C30 45, 45 40, 50 15 Z" />
                    <path d="M50 15 C55 35, 75 35, 90 40 C70 45, 55 40, 50 15 Z" />
                    <path d="M50 15 C50 45, 50 70, 50 85" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <path d="M50 40 C35 50, 30 65, 20 70 C35 68, 45 60, 50 40 Z" />
                    <path d="M50 50 C65 60, 70 75, 80 80 C65 78, 55 70, 50 50 Z" />
                  </svg>
                </motion.div>
              )}

              <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-neutral-800 font-serif leading-none">
                {config.coupleName ? config.coupleName.split('&')[0].trim() : "Camila"}
              </h1>
              <span className="text-2xl font-serif text-[#C4C0B6] block my-1 font-light italic">&</span>
              <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-neutral-800 font-serif leading-none">
                {config.coupleName ? (config.coupleName.split('&')[1] || "").trim() : "Rafael"}
              </h1>
            </div>

            <p className="text-[#8E8B82] text-xl font-serif font-light tracking-wide leading-none capitalize">
              {formattedDate}
            </p>

            {config.tagline && (
              <div className="relative py-4 border-y border-neutral-200">
                <p className="text-neutral-600 text-base font-serif italic leading-relaxed max-w-md pl-6">
                  "{config.tagline}"
                </p>
              </div>
            )}

            {/* Countdown in Elegant Rows */}
            <div className="flex gap-4 sm:gap-8 pt-4">
              {[
                { value: countdown.days, label: "dias" },
                { value: countdown.hours, label: "horas" },
                { value: countdown.minutes, label: "min" },
                { value: countdown.seconds, label: "seg" },
              ].map((item) => (
                <div key={item.label} className="flex flex-col text-left font-serif border-l border-neutral-300 pl-3">
                  <span className="block text-2xl sm:text-4xl font-bold text-neutral-800 leading-none">
                    {String(item.value).padStart(2, "0")}
                  </span>
                  <span className="text-[#8E8B82] text-[10px] uppercase tracking-widest mt-1">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full max-w-xs">
            <button
              onClick={scrollToInfo}
              className="w-full bg-[#1E1E1E] text-white hover:bg-neutral-800 py-4 rounded-none text-xs uppercase tracking-widest font-sans font-bold flex items-center justify-center transition-all duration-300 shadow"
            >
              Ver Informações do Casamento
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (config.layout === "romantic") {
    return (
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden p-4 sm:p-8 md:p-12 bg-[#FCF8F8] font-serif">
        {/* Delicate Romantic Double Frame */}
        <div className="absolute inset-4 sm:inset-6 md:inset-8 border border-rose-200/50 rounded-2xl pointer-events-none z-20" />
        <div className="absolute inset-5 sm:inset-[30px] md:inset-[36px] border border-dashed border-rose-200/30 rounded-2xl pointer-events-none z-20" />

        {/* Background */}
        <div className="absolute inset-0 z-0">
          {hasHeroImage ? (
            <>
              <img
                src={config.heroImage || heroCoupleImage}
                alt={config.coupleName}
                className="w-full h-full object-cover opacity-85"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-[#FFF5F5]/40 via-[#FCF8F8]/60 to-[#FCF8F8]/90" />
            </>
          ) : (
            <div className="w-full h-full bg-[#FCF8F8] flex items-center justify-center">
              <Heart className="w-40 h-40 text-rose-100" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1 }}
            className="mb-3"
          >
            <span className="text-rose-500 font-sans text-xs sm:text-sm tracking-[0.3em] uppercase font-semibold">
              Save our Date
            </span>
          </motion.div>

          {config.themeDecorations !== false && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="flex justify-center mb-6 text-rose-400"
            >
              <svg className="w-16 h-16 opacity-85" viewBox="0 0 100 100" fill="currentColor">
                <path d="M50 15 C45 35, 25 35, 10 40 C30 45, 45 40, 50 15 Z" />
                <path d="M50 15 C55 35, 75 35, 90 40 C70 45, 55 40, 50 15 Z" />
                <path d="M50 15 C50 45, 50 70, 50 85" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path d="M50 40 C35 50, 30 65, 20 70 C35 68, 45 60, 50 40 Z" />
                <path d="M50 50 C65 60, 70 75, 80 80 C65 78, 55 70, 50 50 Z" />
              </svg>
            </motion.div>
          )}

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-6xl sm:text-8xl lg:text-9xl text-rose-800 font-serif italic mb-4 drop-shadow-sm"
            style={{ fontFamily: '"Pinyon Script", cursive' }}
          >
            {config.coupleName || "Camila & Rafael"}
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex items-center justify-center text-rose-400 gap-1 my-3"
          >
            <Heart className="w-6 h-6 fill-rose-400 text-rose-400 animate-pulse" />
          </motion.div>

          {config.tagline && (
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="text-rose-700/80 text-lg sm:text-xl font-light italic mb-6 max-w-md"
            >
               "{config.tagline}"
            </motion.p>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mb-8"
          >
            <p className="text-rose-950 text-xl sm:text-2xl font-serif tracking-wide border-b border-rose-200 pb-2">
              {formattedDate}
            </p>
          </motion.div>

          {/* Countdown in soft rounded circles */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="flex justify-center gap-3 sm:gap-6 mb-8"
          >
            {[
              { value: countdown.days, label: "Dias" },
              { value: countdown.hours, label: "Horas" },
              { value: countdown.minutes, label: "Min" },
              { value: countdown.seconds, label: "Seg" },
            ].map((item) => (
              <div
                key={item.label}
                className="text-center bg-[#FFF8F8]/90 backdrop-blur-sm rounded-full w-16 h-16 sm:w-20 sm:h-20 border border-rose-100 flex flex-col items-center justify-center shadow-sm"
              >
                <span className="block text-xl sm:text-2xl font-semibold text-rose-700 leading-none">
                  {String(item.value).padStart(2, "0")}
                </span>
                <span className="text-rose-400 text-[8px] sm:text-[9px] uppercase tracking-wider mt-0.5">
                  {item.label}
                </span>
              </div>
            ))}
          </motion.div>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            onClick={scrollToInfo}
            className="bg-rose-600 text-white hover:bg-rose-700 py-3 px-8 rounded-full text-xs uppercase tracking-widest font-sans font-bold flex items-center justify-center shadow-md transition-all duration-300 hover:shadow-lg"
          >
            Confirmar Presença
          </motion.button>
        </div>
      </section>
    );
  }

  if (config.layout === "editorial") {
    return (
      <section className="min-h-screen flex flex-col bg-background">
        {/* Top Image Half */}
        <div className="w-full h-[50vh] relative overflow-hidden">
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
        </div>

        {/* Bottom Text Half */}
        <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <p className="text-muted-foreground text-sm sm:text-base tracking-[0.3em] uppercase mb-4 font-light">
              Vamos nos casar
            </p>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className={`${currentStyle.titleClass} text-5xl sm:text-7xl lg:text-8xl mb-6`}
          >
            {config.coupleName}
          </motion.h1>

          {config.tagline && (
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="text-foreground/80 text-xl sm:text-2xl font-light italic mb-8 font-serif"
            >
              "{config.tagline}"
            </motion.p>
          )}

          {config.themeDecorations !== false && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.7 }}
              className="flex justify-center my-6 text-gold"
            >
              <svg
                className="w-16 h-16 opacity-85"
                viewBox="0 0 100 100"
                fill="currentColor"
              >
                <path d="M50 15 C45 35, 25 35, 10 40 C30 45, 45 40, 50 15 Z" />
                <path d="M50 15 C55 35, 75 35, 90 40 C70 45, 55 40, 50 15 Z" />
                <path
                  d="M50 15 C50 45, 50 70, 50 85"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                />
                <path d="M50 40 C35 50, 30 65, 20 70 C35 68, 45 60, 50 40 Z" />
                <path d="M50 50 C65 60, 70 75, 80 80 C65 78, 55 70, 50 50 Z" />
              </svg>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="mb-8"
          >
            <p className="text-gold text-2xl sm:text-3xl font-serif tracking-wide capitalize">
              {formattedDate}
            </p>
          </motion.div>

          {/* Countdown */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1 }}
            className="flex justify-center gap-4 sm:gap-8 mb-12"
          >
            {[
              { value: countdown.days, label: "Dias" },
              { value: countdown.hours, label: "Horas" },
              { value: countdown.minutes, label: "Min" },
              { value: countdown.seconds, label: "Seg" },
            ].map((item) => (
              <div
                key={item.label}
                className="text-center bg-card rounded-lg px-4 sm:px-6 py-3 sm:py-4 border border-border shadow-soft"
              >
                <span className="block text-3xl sm:text-4xl lg:text-5xl font-serif text-foreground">
                  {String(item.value).padStart(2, "0")}
                </span>
                <span className="text-muted-foreground text-xs sm:text-sm uppercase tracking-wider">
                  {item.label}
                </span>
              </div>
            ))}
          </motion.div>

          <motion.button
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.2 }}
            onClick={scrollToInfo}
            className="btn-wedding group"
          >
            {isGuestView && config.sections.weddingInfo
              ? "Ver informações do casamento"
              : "Ver lista de presentes"}
            <ChevronDown className="ml-2 w-5 h-5 group-hover:translate-y-1 transition-transform" />
          </motion.button>
        </div>
      </section>
    );
  }

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        {hasHeroImage ? (
          <>
            <img
              src={config.heroImage || heroCoupleImage}
              alt={config.coupleName}
              className="w-full h-full object-cover"
            />
            <div className={`absolute inset-0 ${currentStyle.overlay}`} />
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-secondary via-muted to-accent flex items-center justify-center">
            <Heart className="w-40 h-40 text-gold/20" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <p className="text-cream/90 text-lg sm:text-xl tracking-[0.3em] uppercase mb-4 font-light">
            Vamos nos casar
          </p>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className={`${currentStyle.titleClass} text-5xl sm:text-7xl lg:text-8xl text-cream mb-6`}
        >
          {config.coupleName}
        </motion.h1>

        {config.tagline && (
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-cream/80 text-xl sm:text-2xl font-light italic mb-8 font-serif"
          >
            "{config.tagline}"
          </motion.p>
        )}

        {config.themeDecorations !== false && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="flex justify-center my-6 text-gold-light"
          >
            <svg
              className="w-16 h-16 opacity-85"
              viewBox="0 0 100 100"
              fill="currentColor"
            >
              <path d="M50 15 C45 35, 25 35, 10 40 C30 45, 45 40, 50 15 Z" />
              <path d="M50 15 C55 35, 75 35, 90 40 C70 45, 55 40, 50 15 Z" />
              <path
                d="M50 15 C50 45, 50 70, 50 85"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
              <path d="M50 40 C35 50, 30 65, 20 70 C35 68, 45 60, 50 40 Z" />
              <path d="M50 50 C65 60, 70 75, 80 80 C65 78, 55 70, 50 50 Z" />
            </svg>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mb-8"
        >
          <p className="text-gold-light text-2xl sm:text-3xl font-serif tracking-wide capitalize">
            {formattedDate}
          </p>
        </motion.div>

        {/* Countdown */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="flex justify-center gap-4 sm:gap-8 mb-12"
        >
          {[
            { value: countdown.days, label: "Dias" },
            { value: countdown.hours, label: "Horas" },
            { value: countdown.minutes, label: "Min" },
            { value: countdown.seconds, label: "Seg" },
          ].map((item) => (
            <div
              key={item.label}
              className="text-center bg-cream/10 backdrop-blur-sm rounded-lg px-4 sm:px-6 py-3 sm:py-4 border border-cream/20"
            >
              <span className="block text-3xl sm:text-4xl lg:text-5xl font-serif text-cream">
                {String(item.value).padStart(2, "0")}
              </span>
              <span className="text-cream/70 text-xs sm:text-sm uppercase tracking-wider">
                {item.label}
              </span>
            </div>
          ))}
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          onClick={scrollToInfo}
          className="btn-wedding group"
        >
          {isGuestView && config.sections.weddingInfo
            ? "Ver informações do casamento"
            : "Ver lista de presentes"}
          <ChevronDown className="ml-2 w-5 h-5 group-hover:translate-y-1 transition-transform" />
        </motion.button>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <div className="w-6 h-10 border-2 border-cream/40 rounded-full flex justify-center p-2">
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-1.5 h-1.5 bg-cream/60 rounded-full"
          />
        </div>
      </motion.div>
    </section>
  );
};

export default PublicHero;
