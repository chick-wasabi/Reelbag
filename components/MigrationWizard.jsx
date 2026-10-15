"use client";

import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import PinForm from "./PinForm";
import { migrateLegacy } from "../utils/storage";

export default function MigrationWizard({ legacy, onComplete }) {
  const [step, setStep] = useState(0);
  const account = legacy.profiles[step];
  return (
    <div className="migration">
      <div className="gate-icon">
        <LockKeyhole size={22} />
      </div>
      <h2>
        {account ? "Bring your saved reels along" : "One library. One PIN."}
      </h2>
      <p className="muted-copy">
        {account
          ? `Verify the existing PIN for “${account.name}” (${step + 1} of ${legacy.profiles.length}). Every old PIN must be verified before combining your libraries.`
          : "Choose a Master PIN for your combined library. All reels and folders will be kept. Old statuses and notes will be removed. You can add folder PINs after migrating."}
      </p>
      {account ? (
        <PinForm
          key={account.id}
          credential={account.pin}
          label={`Existing PIN for ${account.name}`}
          submitLabel="Verify & continue"
          onSuccess={() => setStep((s) => s + 1)}
        />
      ) : (
        <PinForm
          key="new-master"
          create
          onSuccess={(pin) => onComplete(migrateLegacy(legacy, pin))}
        />
      )}
    </div>
  );
}
