"""Script CLI para ejecutar la batería de precisión RNF-07 y generar reportes."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.evaluation.accuracy_evaluator import AccuracyEvaluator, export_reports  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Evalúa precisión IA (RNF-07) y genera matriz de confusión."
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=ROOT / "data" / "validation" / "ground_truth.json",
        help="Ruta al archivo JSON de ground truth.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "reports",
        help="Directorio donde se exportan Markdown, JSON y PNG.",
    )
    args = parser.parse_args(argv)

    evaluator = AccuracyEvaluator()
    report = evaluator.evaluate_dataset(args.dataset)
    exported = export_reports(report, args.output_dir)

    day_sc = report.scenarios["day"]
    night_sc = report.scenarios["night_rain"]
    print(f"[RNF-07] Dataset: {report.dataset_name} ({report.dataset_mode})")
    print(
        f"  - day        : {day_sc.correct}/{day_sc.total_samples} = "
        f"{day_sc.accuracy * 100:.2f}% (umbral >= 95.00%) -> {'PASS' if day_sc.passed else 'FAIL'}"
    )
    print(
        f"  - night_rain : {night_sc.correct}/{night_sc.total_samples} = "
        f"{night_sc.accuracy * 100:.2f}% (umbral >= 90.00%) -> {'PASS' if night_sc.passed else 'FAIL'}"
    )
    print(
        f"  - overall    : {report.overall.correct}/{report.overall.total_samples} = "
        f"{report.overall.accuracy * 100:.2f}%"
    )
    for kind, path in exported.items():
        print(f"  - export[{kind}]: {path}")

    return 0 if report.all_thresholds_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
