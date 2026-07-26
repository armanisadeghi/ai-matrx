"use client";

import { useEffect, useRef } from "react";

interface AutoSubmitFormProps {
  action: () => Promise<void>;
}

export function AutoSubmitForm({ action }: AutoSubmitFormProps) {
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    const form = document.getElementById("auto-submit") as HTMLFormElement;
    form?.requestSubmit();
  }, []);

  return <form id="auto-submit" action={action} className="hidden" />;
}
