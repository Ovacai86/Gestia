import { GastoForm } from "../GastoForm";
import { crearGasto } from "../actions";

export default function NuevoGastoPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Nuevo gasto</h1>
      <GastoForm action={crearGasto} />
    </div>
  );
}
