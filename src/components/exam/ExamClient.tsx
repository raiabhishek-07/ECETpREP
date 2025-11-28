
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AnswerSheet, MarkedQuestions, Question } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Timer, BookMarked, ChevronLeft, ChevronRight, Send, LogOut, Loader2, PanelRightOpen, X, Fullscreen, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Latex from 'react-latex-next';
import 'katex/dist/katex.min.css';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';
import { QuestionPalette } from './QuestionPalette';

const EXAM_DURATION = 2 * 60 * 60; // 2 hours in seconds
const MAX_VIOLATIONS = 3;


// A simple mapping from full slug to the folder name convention
const slugToFolderMap: Record<string, string> = {
    'computer-science': 'CSE',
    'civil-engineering': 'CIVIL',
    'electronics-communication': 'ECE',
    'electrical-electronics': 'EEE',
    'mechanical-engineering': 'MECH',
    'pharmacy': 'PHARMACY',
    'chemical-engineering': 'CHEM',
    'metallurgical-engineering': 'MET',
    'bsc-mathematics': 'BSCMATHS',
};

// Shuffle function to randomize question order
function shuffleArray(array: Question[]): Question[] {
  return array
    .map(q => ({ ...q, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(q => { 
        const newQ = { ...q };
        delete (newQ as any).sort; 
        return newQ; 
    });
}


export default function ExamClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerSheet>({});
  const [markedForReview, setMarkedForReview] = useState<MarkedQuestions>([]);
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [isExitDialogOpen, setIsExitDialogOpen] = useState(false);
  const [examName, setExamName] = useState('ECET Exam');
  const isSubmitting = useRef(false);
  const [startedAt] = useState(new Date().toISOString());

  // Exam Rules State
  const violationCount = useRef(0);
  const [isViolationDialogOpen, setIsViolationDialogOpen] = useState(false);
  const [violationMessage, setViolationMessage] = useState('');

  const handleSubmit = useCallback(() => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }

    if (questions) {
        localStorage.setItem("lastExamData", JSON.stringify({
            answers,
            questions,
            examName,
            startedAt,
            submittedAt: new Date().toISOString(),
        }));
    }
    
    setTimeout(() => router.replace(`/results`), 100);

  }, [answers, questions, examName, router, startedAt]);

  const handleViolation = useCallback((message: string) => {
    violationCount.current += 1;
    if (violationCount.current >= MAX_VIOLATIONS) {
        toast({
            variant: 'destructive',
            title: "Exam Terminated",
            description: `You have exceeded the maximum of ${MAX_VIOLATIONS} violations. Your exam has been submitted.`,
            duration: 5000,
        });
        handleSubmit();
    } else {
        setViolationMessage(`${message}. You have ${MAX_VIOLATIONS - violationCount.current} warning(s) left.`);
        setIsViolationDialogOpen(true);
    }
  }, [handleSubmit, toast]);

  useEffect(() => {
    async function loadQuestions() {
        localStorage.removeItem("lastExamData");

        const customExamKey = searchParams.get('customExamKey');
        const examSlug = searchParams.get('examSlug');
        const year = searchParams.get('year');
        const offlineTestKey = searchParams.get('offlineTestKey');
        const examBoard = searchParams.get('examBoard');

        let loadedQuestions: Question[] = [];

        if (customExamKey) {
            const customQuestionsStr = sessionStorage.getItem(customExamKey);
            if (customQuestionsStr) {
                loadedQuestions = JSON.parse(customQuestionsStr);
                setExamName(sessionStorage.getItem('customExamName') || 'AI Custom Test');
                sessionStorage.removeItem(customExamKey);
                sessionStorage.removeItem('customExamName');
            } else {
                 toast({ title: 'Error', description: 'Custom exam data not found.', variant: 'destructive' });
                 router.push('/exams');
                 return;
            }
        } else if (offlineTestKey) {
             const offlineDataRaw = localStorage.getItem(offlineTestKey);
             if (offlineDataRaw) {
                 const offlineData = JSON.parse(offlineDataRaw);
                 loadedQuestions = offlineData.questions;
                 setExamName(`${offlineData.examName} - ${offlineData.year} (Offline)`);
             } else {
                 toast({ title: 'Error', description: 'Offline exam data not found.', variant: 'destructive' });
                 router.push('/exams/offline');
                 return;
             }
        } else if (examSlug && year && examBoard) {
            setExamName(searchParams.get('examName') || 'ECET Exam');
            try {
                const examBoardFolder = examBoard.toUpperCase();
                const folderName = slugToFolderMap[examSlug] || examSlug.toUpperCase();
                const filePath = `/datasets/${examBoardFolder}/${folderName}/${year}.json`;
                const response = await fetch(filePath);
                if (!response.ok) throw new Error(`Failed to load questions from ${filePath}. Status: ${response.status}`);
                loadedQuestions = await response.json();
            } catch (error) {
                console.error(error);
                toast({ title: 'Error Loading Questions', description: 'Could not load the question paper. It might not be available yet.', variant: 'destructive' });
                router.push('/exams');
                return;
            }
        } else {
            toast({ title: 'Error', description: 'Invalid exam parameters. Please select an exam again.', variant: 'destructive' });
            router.push('/exams');
            return;
        }

        if (loadedQuestions.length > 0) {
            setQuestions(loadedQuestions);
        }
    }

    loadQuestions();
  }, [searchParams, router, toast]);
  
  useEffect(() => {
    if (!questions) return;

    const timer = setInterval(() => {
      setTimeLeft(prevTime => {
        if (prevTime <= 1) {
          clearInterval(timer);
          toast({ title: "Time's Up!", description: "Your exam has been submitted automatically." });
          handleSubmit();
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    const handleFullscreenChange = () => {
        if (!document.fullscreenElement) {
            handleViolation("You have exited fullscreen mode");
        }
    };
    
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            handleViolation("You have switched to another tab or window");
        }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        clearInterval(timer);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleSubmit, questions, toast, handleViolation]);
  
  const handleAnswerSelect = (questionId: number, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleMarkForReview = (questionId: number) => {
    setMarkedForReview(prev =>
      prev.includes(questionId) ? prev.filter(id => id !== questionId) : [...prev, questionId]
    );
  };

  const clearResponse = () => {
    if (!questions) return;
    const questionId = questions[currentQuestionIndex].id;
    const newAnswers = { ...answers };
    delete newAnswers[questionId];
    setAnswers(newAnswers);
  };
  
  const requestFullscreen = () => {
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    }
  };

  if (!questions) {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4 text-lg">Loading & Shuffling Questions...</p>
        </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const isMarked = markedForReview.includes(currentQuestion.id);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  return (
    <div className="flex h-screen flex-col bg-secondary/20">
        <header className="flex-shrink-0 bg-background border-b shadow-sm">
            <div className="container mx-auto px-4 md:px-6 py-3 flex justify-between items-center">
                <h1 className="text-xl md:text-2xl font-headline text-primary truncate pr-4">{examName}</h1>
                <div className="flex items-center gap-3 sm:gap-4">
                    <div className={cn('flex items-center gap-2 font-bold p-2 rounded-lg text-foreground', timeLeft < 300 && 'text-destructive animate-pulse')}>
                        <Timer className="h-6 w-6 text-accent" />
                        <span className="font-mono text-xl">{formatTime(timeLeft)}</span>
                    </div>
                     <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="outline" className="md:hidden" size="icon"><PanelRightOpen className="h-5 w-5" /></Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="p-0 w-[300px] sm:w-[350px] bg-secondary/20 border-l-0">
                            <QuestionPalette
                                questions={questions}
                                answers={answers}
                                markedForReview={markedForReview}
                                currentQuestionIndex={currentQuestionIndex}
                                setCurrentQuestionIndex={setCurrentQuestionIndex}
                                setIsSubmitDialogOpen={setIsSubmitDialogOpen}
                            />
                        </SheetContent>
                    </Sheet>
                    <Button variant="outline" size="icon" onClick={() => setIsExitDialogOpen(true)} className="hidden sm:inline-flex"><LogOut className="h-5 w-5" /></Button>
                </div>
            </div>
        </header>

        <div className="flex-1 container mx-auto px-4 md:px-6 py-6 flex gap-6 overflow-hidden">
            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                <Card className="flex-1 flex flex-col shadow-lg">
                    <CardHeader>
                        <CardTitle className="font-headline text-xl">
                            Question {currentQuestionIndex + 1}/{questions.length}
                        </CardTitle>
                        <CardDescription>Topic: {currentQuestion.topic}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 py-0">
                        <ScrollArea className="h-full">
                            <div className="pr-6 space-y-6">
                                <p className="text-lg"><Latex>{currentQuestion.question}</Latex></p>
                                <RadioGroup
                                    value={answers[currentQuestion.id] || ''}
                                    onValueChange={(value) => handleAnswerSelect(currentQuestion.id, value)}
                                    className="space-y-4"
                                >
                                    {currentQuestion.options.map((option, index) => (
                                    <div key={index} className="flex items-start space-x-3 transition-all duration-200 rounded-lg p-3 hover:bg-primary/5 dark:hover:bg-primary/10 border border-transparent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                                        <RadioGroupItem value={option} id={`q${currentQuestion.id}-op${index}`} className="mt-1"/>
                                        <Label htmlFor={`q${currentQuestion.id}-op${index}`} className="text-base cursor-pointer flex-1">
                                        <Latex>{option}</Latex>
                                        </Label>
                                    </div>
                                    ))}
                                </RadioGroup>
                            </div>
                        </ScrollArea>
                    </CardContent>
                    <CardFooter className="flex flex-col sm:flex-row flex-wrap justify-between items-center gap-4 border-t pt-6">
                        <div className="flex gap-2 flex-wrap justify-center">
                            <Button onClick={() => handleMarkForReview(currentQuestion.id)} variant={isMarked ? "default" : "outline"} className={cn(isMarked && "bg-yellow-500 hover:bg-yellow-600 text-white")}>
                                <BookMarked className="mr-2 h-4 w-4" /> {isMarked ? 'Unmark' : 'Mark for Review'}
                            </Button>
                            <Button onClick={clearResponse} variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                <X className="mr-2 h-4 w-4" /> Clear Response
                            </Button>
                        </div>
                        <div className="flex gap-2">
                        <Button onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))} disabled={currentQuestionIndex === 0}>
                            <ChevronLeft className="mr-2 h-4 w-4" /> Prev
                        </Button>
                        <Button onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))} disabled={currentQuestionIndex === questions.length - 1}>
                            Next <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                        </div>
                    </CardFooter>
                </Card>
            </div>

            {/* Sidebar */}
             <aside className="w-80 lg:w-96 hidden md:flex flex-col">
                 <QuestionPalette
                    questions={questions}
                    answers={answers}
                    markedForReview={markedForReview}
                    currentQuestionIndex={currentQuestionIndex}
                    setCurrentQuestionIndex={setCurrentQuestionIndex}
                    setIsSubmitDialogOpen={setIsSubmitDialogOpen}
                />
            </aside>
        </div>

      <AlertDialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline">Confirm Submission</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to submit the exam? You will not be able to change your answers after submission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setIsSubmitDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              setIsSubmitDialogOpen(false);
              toast({ title: "Exam Submitted!", description: "Your answers have been saved." });
              handleSubmit();
            }} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Submit
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isExitDialogOpen} onOpenChange={setIsExitDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle className="font-headline">Confirm Exit</AlertDialogTitle>
            <AlertDialogDescription>
                Are you sure you want to exit the exam? Your progress will be submitted as is.
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <Button variant="outline" onClick={() => setIsExitDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => {
                setIsExitDialogOpen(false);
                handleSubmit();
            }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Yes, Exit & Submit
            </Button>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

        <AlertDialog open={isViolationDialogOpen} onOpenChange={setIsViolationDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <div className="flex justify-center mb-4">
                        <AlertTriangle className="h-16 w-16 text-yellow-500" />
                    </div>
                    <AlertDialogTitle className="font-headline text-center text-2xl">Rule Violation Warning</AlertDialogTitle>
                    <AlertDialogDescription className="text-center text-base">
                       {violationMessage}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <Button 
                        className="w-full"
                        onClick={() => {
                            setIsViolationDialogOpen(false);
                            requestFullscreen();
                        }}>
                        <Fullscreen className="mr-2 h-4 w-4" /> I Understand, Return to Exam
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

    