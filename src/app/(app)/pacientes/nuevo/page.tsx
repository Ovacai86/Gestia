import { PacienteForm } from "../PacienteForm";
import { crearPaciente } from "../actions";

export default function NuevoPacientePage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Nuevo paciente</h1>
      <PacienteForm action={crearPaciente} />
    </div>
  );
}
