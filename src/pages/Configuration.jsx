import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, HardHat, Wrench, Database } from "lucide-react";
import UsersSection from "@/components/config/UsersSection";
import TechniciansSection from "@/components/config/TechniciansSection";
import RenamePointsSection from "@/components/config/RenamePointsSection";
import DataBackupSection from "@/components/config/DataBackupSection";

export default function Configuration() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-sm mt-1">Administra usuarios, técnicos y herramientas</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Usuarios</span>
          </TabsTrigger>
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
        <TabsContent value="users" className="mt-5">
          <UsersSection />
        </TabsContent>
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