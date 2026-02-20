"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { Model } from "@/lib/models";

const ModelList = ({
  models,
  setOpen,
  setSelectedModel,
}: {
  models: Model[];
  setOpen: (open: boolean) => void;
  setSelectedModel: (models: Model) => void;
}) => {
  return (
    <Command>
      <CommandInput placeholder="Filter models..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Models">
          {models.map((model) => (
            <CommandItem
              key={model.id}
              value={model.id}
              onSelect={(value) => {
                setSelectedModel(
                  models.find((m) => m.id === value) ?? models[0],
                );
                setOpen(false);
              }}
            >
              {model.name}
              {model.tag?.map((item) => (
                <Badge key={item} variant="outline" className="ml-auto">
                  {item}
                </Badge>
              ))}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

function ComboBoxResponsive({
  models,
  selectedModel,
  setSelectedModel,
}: {
  models: Model[];
  selectedModel?: Model;
  setSelectedModel: (model: Model) => void;
}) {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const handleModelChange = useCallback((model: Model) => {
    setSelectedModel(model);
    localStorage.setItem("CF_AI_MODEL", model.id);
    localStorage.setItem("CF_AI_MODEL_SELECTED", "true"); // 标记用户已手动选择
  }, [setSelectedModel]);

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {selectedModel && (
            <Button variant="ghost">
              {selectedModel.name}
              <ChevronDown />
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <ModelList
            setOpen={setOpen}
            setSelectedModel={handleModelChange}
            models={models}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {selectedModel && (
          <Button variant="ghost">
            {selectedModel.name}
            <ChevronDown />
          </Button>
        )}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerTitle></DrawerTitle>
        <div className="mt-4 border-t">
          <ModelList
            setOpen={setOpen}
            setSelectedModel={handleModelChange}
            models={models}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

const ModelSelect = ({
  models,
  selectedModel,
  setSelectedModel,
}: {
  models: Model[];
  selectedModel?: Model;
  setSelectedModel: (model: Model) => void;
}) => {
  return (
    <ComboBoxResponsive
      models={models}
      selectedModel={selectedModel}
      setSelectedModel={setSelectedModel}
    />
  );
};

export default ModelSelect;
