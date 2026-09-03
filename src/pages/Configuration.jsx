import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HardHat, Wrench, Database } from "lucide-react";
import TechniciansSection from "@/components/config/TechniciansSection";
import RenamePointsSection from "@/components/config/RenamePointsSection";
import DataBackupSection from "@/components/config/DataBackupSection";

export default function Configuration() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-sm mt-1">Administra técnicos, herramientas y datos</p>
      </div>

      <Tabs defaultValue="techs">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="techs" className="gap-1.5">
            <HardHat className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Técnicos</span>
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-1.5">
            <Wrench className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Herramientas</span>
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5">
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Datos</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="techs" className="mt-5">
          <TechniciansSection />
        </TabsContent>
        <TabsContent value="tools" className="mt-5">
          <RenamePointsSection />
        </TabsContent>
        <TabsContent value="data" className="mt-5">
          <DataBackupSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
