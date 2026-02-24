import { useState } from "react";
import { motion } from "framer-motion";
import {
  Cpu,
  ArrowRight,
  Sparkles,
  Users,
  CheckCircle2,
  Database,
  Globe,
  Headphones,
  ChevronRight,
  Menu,
  X,
  FileCode,
  BookOpen,
  LifeBuoy,
  Server,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

const Landing = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background overflow-hidden scroll-smooth">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[300px] md:w-[600px] h-[300px] md:h-[600px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[250px] md:w-[500px] h-[250px] md:h-[500px] rounded-full bg-accent/5 blur-[100px]" />
        <div className="absolute top-[40%] left-[50%] w-[200px] md:w-[400px] h-[200px] md:h-[400px] rounded-full bg-primary/3 blur-[80px]" />
      </div>
      <div className="fixed inset-0 noise pointer-events-none" />

      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/50 backdrop-blur-xl bg-background/80">
        <div className="container mx-auto px-4 md:px-6 h-14 md:h-16 flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 md:gap-3"
          >
            <div className="flex items-center justify-center shrink-0">
              <Logo size={40} className="w-8 h-8 md:w-10 md:h-10" />
            </div>
            <span className="text-lg md:text-xl font-semibold tracking-tight">GetIT GenAI</span>
          </motion.div>

          {/* Desktop Nav */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="hidden lg:flex items-center gap-8"
          >
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              How it Works
            </a>
            <a href="#use-cases" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Use Cases
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 md:gap-3"
          >
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/login">Sign In</Link>
            </Button>
            <Button variant="default" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/login">Get Started</Link>
            </Button>
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-secondary transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </motion.div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl"
          >
            <div className="container mx-auto px-4 py-4 space-y-3">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground py-2">Features</a>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground py-2">How it Works</a>
              <a href="#use-cases" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground py-2">Use Cases</a>
              <div className="pt-3 border-t border-border/50 flex gap-2">
                <Button variant="ghost" size="sm" asChild className="flex-1">
                  <Link to="/login">Sign In</Link>
                </Button>
                <Button variant="default" size="sm" asChild className="flex-1">
                  <Link to="/login">Get Started</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-12 pb-16 md:pt-20 md:pb-32">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-secondary border border-border mb-6 md:mb-8"
            >
              <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary" />
              <span className="text-xs md:text-sm font-medium text-muted-foreground">
                Enterprise-Grade AI Assistant
              </span>
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold tracking-tight mb-4 md:mb-6"
            >
              <span className="block">Intelligent Support</span>
              <span className="gradient-text">For IT Engineers</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-base md:text-xl text-muted-foreground mb-8 md:mb-12 max-w-2xl mx-auto leading-relaxed px-2"
            >
              Harness the power of RAG-enhanced AI to resolve desktop support issues faster.
              Access your knowledge base instantly with natural language queries.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4"
            >
              <Button variant="hero" size="lg" className="w-full sm:w-auto" asChild>
                <Link to="/chat" className="gap-2">
                  Launch Console
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="w-full sm:w-auto" asChild>
                <Link to="/login">View Documentation</Link>
              </Button>
            </motion.div>
          </div>

          {/* Hero Visual */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="mt-12 md:mt-20 relative"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
            <div className="glass rounded-xl md:rounded-2xl p-1 max-w-5xl mx-auto shadow-2xl shadow-primary/10">
              <div className="bg-card rounded-lg md:rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 border-b border-border">
                  <div className="flex gap-1.5 md:gap-2">
                    <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-destructive/60" />
                    <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-accent/60" />
                    <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-primary/60" />
                  </div>
                  <span className="text-xs md:text-sm text-muted-foreground font-mono ml-2 md:ml-4">
                    nexus-ai-console
                  </span>
                </div>
                <div className="p-3 md:p-6 space-y-3 md:space-y-4 font-mono text-xs md:text-sm">
                  <div className="flex items-start gap-2 md:gap-3">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <span className="text-xs text-muted-foreground">U</span>
                    </div>
                    <div className="bg-secondary rounded-lg px-3 md:px-4 py-2 md:py-3">
                      <p className="text-foreground">How do I resolve BSOD error 0x0000007E on Windows 11?</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 md:gap-3">
                    <div className="flex items-center justify-center shrink-0">
                      <Logo size={32} className="w-7 h-7 md:w-8 md:h-8" />
                    </div>
                    <div className="bg-secondary rounded-lg px-3 md:px-4 py-2 md:py-3 border border-primary/20">
                      <p className="text-foreground">
                        Based on your knowledge base, BSOD 0x0000007E typically indicates a driver issue.
                        <span className="text-primary"> Here are the steps:</span>
                      </p>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        <li>→ Boot into Safe Mode</li>
                        <li>→ Run Driver Verifier</li>
                        <li>→ Check memory with Windows Memory Diagnostic</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10 md:mb-16"
          >
            <span className="text-primary font-medium text-xs md:text-sm uppercase tracking-wider">Features</span>
            <h2 className="text-2xl md:text-3xl lg:text-5xl font-bold mt-3 md:mt-4 mb-3 md:mb-4">
              Built for Enterprise IT
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm md:text-lg px-2">
              Powerful features designed specifically for desktop support engineers
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 max-w-6xl mx-auto">
            {[
              {
                icon: "🧠",
                title: "RAG-Enhanced AI",
                description: "Retrieval-augmented generation pulls from your internal documentation and knowledge base for accurate answers.",
              },
              {
                icon: "🛡️",
                title: "Enterprise Security",
                description: "SOC 2 Type II compliant with end-to-end encryption, SSO integration, and role-based access controls.",
              },
              {
                icon: "⚡",
                title: "Instant Resolution",
                description: "Reduce ticket resolution time by 60% with AI-powered troubleshooting and automated workflows.",
              },
              {
                icon: "🗄️",
                title: "Knowledge Base Sync",
                description: "Automatically syncs with Confluence, SharePoint, and internal wikis to stay up-to-date.",
              },
              {
                icon: "💬",
                title: "Context-Aware Chat",
                description: "Maintains conversation context and learns from previous interactions for better responses.",
              },
              {
                icon: "📊",
                title: "Analytics Dashboard",
                description: "Track resolution rates, common issues, and team performance with detailed analytics.",
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-card border border-border rounded-xl md:rounded-2xl p-5 md:p-6 hover:border-primary/30 transition-all hover:shadow-lg group"
              >
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 md:mb-4 group-hover:bg-primary/20 transition-colors">
                  <span className="text-xl md:text-2xl leading-none">{feature.icon}</span>
                </div>
                <h3 className="text-base md:text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-xs md:text-sm leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-16 md:py-24 bg-secondary/30">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10 md:mb-16"
          >
            <span className="text-primary font-medium text-xs md:text-sm uppercase tracking-wider">How It Works</span>
            <h2 className="text-2xl md:text-3xl lg:text-5xl font-bold mt-3 md:mt-4 mb-3 md:mb-4">
              Three Simple Steps
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm md:text-lg px-2">
              Get started in minutes and transform your IT support workflow
            </p>
          </motion.div>

          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-3 gap-6 md:gap-8">
              {[
                {
                  step: "01",
                  title: "Connect Your Knowledge",
                  description: "Integrate with your existing documentation sources - Confluence, SharePoint, internal wikis, and more.",
                  icon: "🔗",
                },
                {
                  step: "02",
                  title: "Ask Questions Naturally",
                  description: "Engineers ask questions in plain language. Our AI understands context and technical terminology.",
                  icon: "💬",
                },
                {
                  step: "03",
                  title: "Get Instant Answers",
                  description: "Receive accurate, step-by-step solutions pulled directly from your verified knowledge base.",
                  icon: "✅",
                },
              ].map((item, index) => (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.15 }}
                  className="relative"
                >
                  <div className="text-5xl md:text-7xl font-bold text-primary/10 absolute -top-4 md:-top-6 left-0">
                    {item.step}
                  </div>
                  <div className="pt-6 md:pt-8">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 md:mb-4">
                      <span className="text-2xl md:text-3xl leading-none">{item.icon}</span>
                    </div>
                    <h3 className="text-lg md:text-xl font-semibold mb-2 md:mb-3">{item.title}</h3>
                    <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section id="use-cases" className="py-16 md:py-24 bg-secondary/30">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10 md:mb-16"
          >
            <span className="text-primary font-medium text-xs md:text-sm uppercase tracking-wider">Use Cases</span>
            <h2 className="text-2xl md:text-3xl lg:text-5xl font-bold mt-3 md:mt-4 mb-3 md:mb-4">
              Built for Real IT Scenarios
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm md:text-lg px-2">
              How desktop support teams leverage GetIT GenAI to solve critical issues daily
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 max-w-6xl mx-auto">
            {[
              {
                icon: "🖥️",
                title: "BSOD & System Crashes",
                description: "Instantly diagnose blue screen errors with root cause analysis pulled from your verified runbooks and past resolutions.",
                metric: "85% auto-resolved",
              },
              {
                icon: "🌐",
                title: "Network & Connectivity",
                description: "Troubleshoot VPN failures, DNS issues, and network drops with step-by-step guided diagnostics and automated checks.",
                metric: "3min avg. resolution",
              },
              {
                icon: "🔐",
                title: "Access & Permissions",
                description: "Resolve account lockouts, permission escalations, and SSO issues by querying Active Directory and identity providers.",
                metric: "Zero-touch resolution",
              },
            ].map((useCase, index) => (
              <motion.div
                key={useCase.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-card border border-border rounded-xl md:rounded-2xl p-5 md:p-6 hover:border-primary/30 transition-all"
              >
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 md:mb-4">
                  <span className="text-xl md:text-2xl leading-none">{useCase.icon}</span>
                </div>
                <h3 className="text-base md:text-lg font-semibold mb-2">{useCase.title}</h3>
                <p className="text-muted-foreground text-xs md:text-sm leading-relaxed mb-3 md:mb-4">
                  {useCase.description}
                </p>
                <div className="inline-flex items-center gap-2 text-[10px] md:text-xs font-mono px-2.5 py-1 md:px-3 md:py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  <CheckCircle2 className="w-3 h-3" />
                  {useCase.metric}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-primary/10 via-card to-accent/10 border border-border rounded-2xl md:rounded-3xl p-8 md:p-12 text-center max-w-4xl mx-auto"
          >
            <h2 className="text-2xl md:text-3xl lg:text-5xl font-bold mb-3 md:mb-4">
              Ready to Transform Your IT Support?
            </h2>
            <p className="text-muted-foreground mb-6 md:mb-8 max-w-lg mx-auto text-sm md:text-lg px-2">
              Empower your desktop support engineers with agentic AI that resolves issues autonomously.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4">
              <Button variant="hero" size="lg" className="w-full sm:w-auto" asChild>
                <Link to="/chat" className="gap-2">
                  Launch Console
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2" asChild>
                <Link to="/login">
                  <Headphones className="w-5 h-5" />
                  Request Access
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 md:py-12">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 mb-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3 md:mb-4">
                <Logo size={32} />
                <span className="font-semibold text-base md:text-lg">GetIT GenAI</span>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                Enterprise-grade AI assistant for IT support teams. Powered by RAG technology.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-3 md:mb-4 text-sm md:text-base">Product</h4>
              <ul className="space-y-2 text-xs md:text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors flex items-center gap-1.5"><Sparkles className="w-3 h-3" />Features</a></li>
                <li><a href="#use-cases" className="hover:text-foreground transition-colors flex items-center gap-1.5"><Cpu className="w-3 h-3" />Use Cases</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors flex items-center gap-1.5"><BookOpen className="w-3 h-3" />Documentation</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3 md:mb-4 text-sm md:text-base">Resources</h4>
              <ul className="space-y-2 text-xs md:text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors flex items-center gap-1.5"><FileCode className="w-3 h-3" />API Reference</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors flex items-center gap-1.5"><Database className="w-3 h-3" />Knowledge Base</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors flex items-center gap-1.5"><Activity className="w-3 h-3" />Status Page</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors flex items-center gap-1.5"><Globe className="w-3 h-3" />Release Notes</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3 md:mb-4 text-sm md:text-base">Support</h4>
              <ul className="space-y-2 text-xs md:text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors flex items-center gap-1.5"><LifeBuoy className="w-3 h-3" />Help Center</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors flex items-center gap-1.5"><Users className="w-3 h-3" />Community</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors flex items-center gap-1.5"><Headphones className="w-3 h-3" />Contact Us</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors flex items-center gap-1.5"><Server className="w-3 h-3" />System Requirements</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-6 md:pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs md:text-sm text-muted-foreground">
              © 2030 GetIT GenAI. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
