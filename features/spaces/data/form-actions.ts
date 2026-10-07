"use server";

/**
 * N8 — the Form view for a person who may not edit the form: the form as the platform's forms system
 * serves its public link (`custom.form_public`, the same door `/f/<id>` reads). A form that is not
 * published or not open answers its own state, so the rule for who may answer is the forms system's.
 */
import { publicForm, type PublicForm } from "@/features/forms/service";

export async function spacesFormForAnswering(formId: string): Promise<PublicForm | null> {
  return publicForm(formId);
}
