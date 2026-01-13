import React from "react";
import { CreateOrganization } from "@clerk/clerk-react";

const CreateOrganizationPage = () => {
  return (
    <div className="flex justify-center items-start pt-10 h-full">
      <CreateOrganization 
        afterCreateOrganizationUrl="/team" // Redirect to Team page after creation
        appearance={{
          elements: {
            rootBox: "bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl",
            card: "bg-neutral-900 shadow-none",
            headerTitle: "text-white",
            headerSubtitle: "text-neutral-400",
            formFieldLabel: "text-neutral-300",
            formFieldInput: "bg-neutral-950 border-neutral-800 text-white",
            formButtonPrimary: "!bg-white !text-neutral-950 hover:!bg-neutral-200",
          }
        }}
      />
    </div>
  );
};

export default CreateOrganizationPage;