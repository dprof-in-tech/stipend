"use client";

import { useState } from 'react';
import { T } from './theme';
import { Btn, MonoText } from './ui';
import { IconCheck, IconLock, IconBolt, IconX } from './icons';

interface TutorialModalProps {
  onClose: () => void;
}

const steps = [
  {
    title: "Welcome to Stipend",
    eyebrow: "AI Research Platform",
    description: "Stipend connects you with autonomous AI agents that conduct deep, exhaustive research on any topic you choose. No more hallucinated summaries—just verifiable facts.",
    icon: <IconBolt />,
    color: T.blue,
    colorSoft: T.blueSoft,
  },
  {
    title: "Trustless Escrow",
    eyebrow: "Guaranteed Payouts",
    description: "When you fund a task, your USDC is locked securely in a Stellar smart contract. The agent knows the money is guaranteed, but they don't get paid until the work is done and verified.",
    icon: <IconLock />,
    color: T.amber,
    colorSoft: T.amberSoft,
  },
  {
    title: "Adversarial Verification",
    eyebrow: "Peer Reviewed",
    description: "Before funds are released, an independent, adversarial AI 'Verifier' grades the agent's work. It checks citations, rationale, and coverage against your original prompt.",
    icon: <IconCheck />,
    color: T.emerald,
    colorSoft: T.emeraldSoft,
  },
  {
    title: "Guaranteed Refunds",
    eyebrow: "Failure Paths",
    description: "If the agent fails to complete the task, or the verifier completely rejects the research quality, you receive a 100% refund. If the work is partially successful, a fair 50/50 split is applied.",
    icon: <IconX />,
    color: T.red,
    colorSoft: T.redSoft,
  }
];

export function TutorialModal({ onClose }: TutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const step = steps[currentStep];

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      animation: 'fadein 0.4s ease-out'
    }}>
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideup { 
          from { opacity: 0; transform: translateY(20px) scale(0.98); } 
          to { opacity: 1; transform: translateY(0) scale(1); } 
        }
        `
      }} />
      
      <div 
        key={currentStep} // Triggers re-animation on step change
        style={{
        background: T.surface,
        borderRadius: 24,
        width: '100%',
        maxWidth: 480,
        boxShadow: '0 24px 48px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        animation: 'slideup 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        <div style={{ 
          height: 180, 
          background: `linear-gradient(135deg, ${step.colorSoft} 0%, ${T.surface} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: `1px solid ${T.hairSoft}`
        }}>
          <div style={{
            width: 80, height: 80,
            borderRadius: 40,
            background: '#fff',
            color: step.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            border: `1px solid ${step.colorSoft}`
          }}>
            {/* Clone icon with larger size */}
            <div style={{ transform: 'scale(1.5)' }}>
              {step.icon}
            </div>
          </div>
        </div>

        <div style={{ padding: '32px 32px 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <MonoText style={{ 
              color: step.color, 
              fontSize: 12, 
              textTransform: 'uppercase', 
              letterSpacing: 1.5,
              display: 'block',
              marginBottom: 8,
              fontWeight: 600
            }}>
              {step.eyebrow}
            </MonoText>
            <h2 style={{ 
              margin: 0, 
              fontSize: 28, 
              fontWeight: 600, 
              letterSpacing: -0.8,
              color: T.ink,
              marginBottom: 16
            }}>
              {step.title}
            </h2>
            <p style={{ 
              margin: 0, 
              fontSize: 16, 
              lineHeight: 1.6, 
              color: T.ink2 
            }}>
              {step.description}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 40 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {steps.map((_, idx) => (
                <div key={idx} style={{
                  width: idx === currentStep ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: idx === currentStep ? step.color : T.hair,
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                }} />
              ))}
            </div>
            
            <div style={{ display: 'flex', gap: 12 }}>
              {currentStep > 0 && (
                <Btn tone="ghost" onClick={() => setCurrentStep(currentStep - 1)}>
                  Back
                </Btn>
              )}
              <Btn 
                tone="primary" 
                onClick={handleNext} 
                style={{ background: step.color, color: '#fff', border: 'none' }}
              >
                {currentStep === steps.length - 1 ? "Get Started" : "Continue"}
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
