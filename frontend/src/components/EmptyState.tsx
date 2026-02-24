import { KeyRound, Mail, Gauge, Monitor, Sparkles, Globe } from 'lucide-react';

interface EmptyStateProps {
  onSampleQuestion: (question: string) => void;
}

const SAMPLE_QUESTIONS = [
  {
    icon: KeyRound,
    title: 'Password Reset',
    question: 'How do I reset my Windows password when I\'m locked out of my computer?',
  },
  {
    icon: Mail,
    title: 'Outlook Issues',
    question: 'Outlook is not opening and shows an error. How can I fix this?',
  },
  {
    icon: Gauge,
    title: 'System Slowness',
    question: 'My computer is running extremely slow and applications take forever to open. What should I check?',
  },
  {
    icon: Monitor,
    title: 'Display Problems',
    question: 'My second monitor is not being detected. How do I troubleshoot this?',
  },
];

export function EmptyState({ onSampleQuestion }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in-up min-h-[calc(100vh-200px)]">
      {/* Hero Section */}
      <div className="text-center mb-12 max-w-2xl">
        <div className="relative inline-flex mb-8">
          <div className="w-24 h-24 rounded-3xl bg-card border border-border flex items-center justify-center shadow-2xl shadow-primary/30 p-4">
            <img
              src="/GETIT logo black.png"
              alt="GetIT Logo"
              className="w-full h-full object-contain dark:hidden"
            />
            <img
              src="/GETIT logo white.png"
              alt="GetIT Logo"
              className="w-full h-full object-contain hidden dark:block"
            />
          </div>
          <div className="absolute -right-2 -bottom-2 w-8 h-8 rounded-xl bg-card border border-border flex items-center justify-center shadow-lg">
            <Globe className="w-4 h-4 text-primary" />
          </div>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent whitespace-nowrap leading-normal pb-2">
          Welcome to GetIT GenAI
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mx-auto mb-3">
          Your AI-powered IT support assistant. Get instant help with technical issues, troubleshooting, and more.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
          <Globe className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-primary">Powered by real-time web search</span>
        </div>
      </div>

      {/* Sample Questions */}
      <div className="w-full max-w-3xl">
        <p className="text-sm font-medium text-muted-foreground mb-4 text-center">
          Common IT support questions
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SAMPLE_QUESTIONS.map((item, idx) => (
            <button
              key={idx}
              onClick={() => onSampleQuestion(item.question)}
              className="group p-5 rounded-2xl border border-border bg-card/50 hover:bg-card hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 text-left"
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shrink-0">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                    {item.title}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {item.question}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>


    </div>
  );
}
